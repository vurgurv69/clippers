import fs from "fs/promises";
import os from "os";
import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import { detectScriptLanguage } from "./topic-title";
import type { TranscriptSegment, TranscriptWord } from "./types";

type WhisperChunk = {
  text?: string;
  timestamp?: [number, number | null];
};

type WhisperResult = {
  text?: string;
  chunks?: WhisperChunk[];
};

type RawAudio = { data: Float32Array; sampling_rate: number };
type Transcriber = (
  audio: Float32Array | string | RawAudio,
  options?: Record<string, unknown>,
) => Promise<WhisperResult>;

const SAMPLE_RATE = 16000;
/** Larger chunks = fewer model calls (biggest local speed win after tiny model). */
const CHUNK_SECONDS = 30;
/** Skip near-silent audio more aggressively so Whisper isn't run on dead air. */
const SILENCE_ENERGY = 0.012;
/**
 * Cap how much speech we feed Whisper. Long YouTube videos were taking ages;
 * active-audio scoring still covers the rest of the timeline.
 */
const MAX_ASR_SECONDS = Number(process.env.WHISPER_MAX_SECONDS || 600);

let transcriberPromise: Promise<Transcriber> | null = null;
let loadedModelId: string | null = null;

function modelForQuality(quality?: string) {
  const q = (quality || process.env.WHISPER_QUALITY || "fast").toLowerCase();
  if (process.env.WHISPER_MODEL) return process.env.WHISPER_MODEL;
  if (q === "best" || q === "balanced") return "Xenova/whisper-small";
  return "Xenova/whisper-tiny";
}

async function getTranscriber(quality?: string): Promise<Transcriber> {
  const model = modelForQuality(quality);
  if (transcriberPromise && loadedModelId === model) return transcriberPromise;

  loadedModelId = model;
  transcriberPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    try {
      const threads = Math.max(1, Math.min(8, os.cpus().length || 2));
      const wasm = (env as { backends?: { onnx?: { wasm?: { numThreads?: number } } } })
        .backends?.onnx?.wasm;
      if (wasm) wasm.numThreads = threads;
    } catch {
      // ignore
    }

    try {
      const asr = await pipeline("automatic-speech-recognition", model, {
        quantized: true,
      });
      return asr as unknown as Transcriber;
    } catch {
      const asr = await pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-tiny",
        { quantized: true },
      );
      loadedModelId = "Xenova/whisper-tiny";
      return asr as unknown as Transcriber;
    }
  })();
  return transcriberPromise;
}

async function extractWav(videoPath: string, wavPath: string) {
  await runCommand(ffmpegPath(), [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
}

async function wavToFloat32(wavPath: string): Promise<Float32Array> {
  const buf = await fs.readFile(wavPath);
  let offset = 12;
  let dataOffset = 44;
  let dataSize = buf.length - 44;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size;
  }

  const sampleCount = Math.floor(dataSize / 2);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  }
  return samples;
}

function cleanWord(raw: string) {
  return raw
    .replace(/^[^\w\u0600-\u06FF']+|[^\w\u0600-\u06FF']+$/gu, "")
    .trim();
}

function resultToChunks(result: WhisperResult, audioLenSec: number): WhisperChunk[] {
  if (result.chunks?.length) return result.chunks;
  const text = (result.text || "").trim();
  if (!text) return [];
  return [{ text, timestamp: [0, Math.max(0.5, audioLenSec)] }];
}

function chunksToWords(
  chunks: WhisperChunk[],
  timeOffset: number,
): TranscriptWord[] {
  const words: TranscriptWord[] = [];

  for (const chunk of chunks) {
    const text = (chunk.text || "").trim();
    if (!text) continue;

    const start0 = (chunk.timestamp?.[0] ?? 0) + timeOffset;
    const end0 =
      (chunk.timestamp?.[1] ?? chunk.timestamp?.[0] ?? 0) + timeOffset;
    const end = Math.max(end0, start0 + 0.2);
    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;

    const span = Math.max(end - start0, 0.05);
    const step = span / parts.length;
    parts.forEach((part, i) => {
      const word = cleanWord(part) || part;
      if (!word) return;
      words.push({
        word,
        start: start0 + i * step,
        end: start0 + (i + 1) * step,
      });
    });
  }

  return words;
}

function wordsToSegments(words: TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let bucket: TranscriptWord[] = [];
  let segStart = 0;

  const flush = (segEnd: number) => {
    if (!bucket.length) return;
    segments.push({
      id: segments.length,
      start: segStart,
      end: segEnd,
      text: bucket.map((w) => w.word).join(" "),
      words: [...bucket],
    });
    bucket = [];
  };

  words.forEach((w, i) => {
    if (!bucket.length) segStart = w.start;
    bucket.push(w);
    const shouldFlush =
      bucket.length >= 10 ||
      /[.!?؟۔]$/.test(w.word) ||
      i === words.length - 1;
    if (shouldFlush) flush(w.end);
  });

  return segments;
}

function detectLangHint(text: string): "arabic" | "english" | null {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (arabic >= 4 && arabic >= latin * 0.4) return "arabic";
  if (latin >= 8) return "english";
  return null;
}

async function transcribeChunk(
  transcriber: Transcriber,
  slice: Float32Array,
  timeOffset: number,
  langHint: "arabic" | "english" | null,
): Promise<{ words: TranscriptWord[]; hint: "arabic" | "english" | null }> {
  const baseOpts: Record<string, unknown> = {
    return_timestamps: true,
    // Smaller stride = less re-processing of overlap (faster).
    chunk_length_s: 30,
    stride_length_s: 3,
    task: "transcribe",
  };
  if (langHint) baseOpts.language = langHint;

  const result = await transcriber(
    { data: slice, sampling_rate: SAMPLE_RATE },
    baseOpts,
  );

  let chunks = resultToChunks(result, slice.length / SAMPLE_RATE);

  // Only retry empty chunks once — don't double-run every silent/mumble slice.
  if (!chunks.length && !langHint) {
    for (const language of ["english", "arabic"] as const) {
      const retry = await transcriber(
        { data: slice, sampling_rate: SAMPLE_RATE },
        {
          return_timestamps: true,
          language,
          task: "transcribe",
        },
      );
      chunks = resultToChunks(retry, slice.length / SAMPLE_RATE);
      if (chunks.length) {
        return {
          words: chunksToWords(chunks, timeOffset),
          hint: language,
        };
      }
    }
  }

  const words = chunksToWords(chunks, timeOffset);
  const joined = words.map((w) => w.word).join(" ");
  return {
    words,
    hint: langHint || detectLangHint(joined),
  };
}

export type TranscriptResult = {
  segments: TranscriptSegment[];
  language: "ar" | "en";
};

export async function transcribeVideo(
  jobId: string,
  videoPath: string,
  onProgress?: (pct: number, message: string) => void | Promise<void>,
  whisperQuality?: string,
): Promise<TranscriptResult> {
  const dir = jobDir(jobId);
  const wavPath = path.join(dir, "audio.wav");
  await extractWav(videoPath, wavPath);
  await onProgress?.(32, "Loading Whisper model…");

  const audio = await wavToFloat32(wavPath);
  const transcriber = await getTranscriber(whisperQuality);
  const chunkSamples = CHUNK_SECONDS * SAMPLE_RATE;
  const allWords: TranscriptWord[] = [];
  const totalChunks = Math.max(1, Math.ceil(audio.length / chunkSamples));
  let asrSeconds = 0;
  let langHint: "arabic" | "english" | null = null;
  let processed = 0;

  for (let start = 0; start < audio.length; start += chunkSamples) {
    if (asrSeconds >= MAX_ASR_SECONDS) break;

    const end = Math.min(audio.length, start + chunkSamples);
    const slice = audio.subarray(start, end);
    let energy = 0;
    for (let i = 0; i < slice.length; i += 200) {
      energy += Math.abs(slice[i]);
    }
    processed += 1;
    if (energy / (slice.length / 200) < SILENCE_ENERGY) {
      if (processed % 2 === 0) {
        const pct = 32 + Math.round((processed / totalChunks) * 18);
        await onProgress?.(
          Math.min(50, pct),
          `Listening… skipped quiet audio (${Math.round(start / SAMPLE_RATE)}s)`,
        );
      }
      continue;
    }

    const timeOffset = start / SAMPLE_RATE;
    try {
      const { words, hint } = await transcribeChunk(
        transcriber,
        slice,
        timeOffset,
        langHint,
      );
      if (hint) langHint = hint;
      allWords.push(...words);
      asrSeconds += slice.length / SAMPLE_RATE;
    } catch (err) {
      await fs.writeFile(
        path.join(dir, "transcribe-error.log"),
        `chunk@${timeOffset}: ${err instanceof Error ? err.message : String(err)}\n`,
        { flag: "a" },
      );
    }

    const pct = 32 + Math.round((processed / totalChunks) * 18);
    await onProgress?.(
      Math.min(50, pct),
      `Listening… ${Math.round(timeOffset)}s / ~${Math.round(audio.length / SAMPLE_RATE)}s`,
    );
  }

  allWords.sort((a, b) => a.start - b.start);
  const segments = wordsToSegments(allWords);
  const fullText = segments.map((s) => s.text).join(" ");
  const language = detectScriptLanguage(fullText);

  await fs.writeFile(
    path.join(dir, "transcript.json"),
    JSON.stringify(
      {
        language,
        segments,
        wordCount: allWords.length,
        asrSeconds: Math.round(asrSeconds),
        model: process.env.WHISPER_MODEL || "Xenova/whisper-tiny",
      },
      null,
      2,
    ),
    "utf8",
  );

  return { segments, language };
}
