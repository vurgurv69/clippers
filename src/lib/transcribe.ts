import fs from "fs/promises";
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
const CHUNK_SECONDS = 28;

let transcriberPromise: Promise<Transcriber> | null = null;

async function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = false;

      // Multilingual — Arabic + English. whisper-small is more accurate for Arabic.
      const model = process.env.WHISPER_MODEL || "Xenova/whisper-small";
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
        return asr as unknown as Transcriber;
      }
    })();
  }
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

async function transcribeChunk(
  transcriber: Transcriber,
  slice: Float32Array,
  timeOffset: number,
): Promise<TranscriptWord[]> {
  // Segment timestamps are more reliable than word timestamps on multilingual models
  const result = await transcriber(
    { data: slice, sampling_rate: SAMPLE_RATE },
    {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
    },
  );

  let chunks = resultToChunks(result, slice.length / SAMPLE_RATE);

  // Retry with forced language hints if empty
  if (!chunks.length) {
    for (const language of ["arabic", "english"] as const) {
      const retry = await transcriber(
        { data: slice, sampling_rate: SAMPLE_RATE },
        {
          return_timestamps: true,
          language,
          task: "transcribe",
        },
      );
      chunks = resultToChunks(retry, slice.length / SAMPLE_RATE);
      if (chunks.length) break;
    }
  }

  return chunksToWords(chunks, timeOffset);
}

export type TranscriptResult = {
  segments: TranscriptSegment[];
  language: "ar" | "en";
};

export async function transcribeVideo(
  jobId: string,
  videoPath: string,
): Promise<TranscriptResult> {
  const dir = jobDir(jobId);
  const wavPath = path.join(dir, "audio.wav");
  await extractWav(videoPath, wavPath);

  const audio = await wavToFloat32(wavPath);
  const transcriber = await getTranscriber();
  const chunkSamples = CHUNK_SECONDS * SAMPLE_RATE;
  const allWords: TranscriptWord[] = [];

  for (let start = 0; start < audio.length; start += chunkSamples) {
    const end = Math.min(audio.length, start + chunkSamples);
    // Skip near-silent chunks
    const slice = audio.subarray(start, end);
    let energy = 0;
    for (let i = 0; i < slice.length; i += 200) {
      energy += Math.abs(slice[i]);
    }
    if (energy / (slice.length / 200) < 0.008) continue;

    const timeOffset = start / SAMPLE_RATE;
    try {
      const words = await transcribeChunk(transcriber, slice, timeOffset);
      allWords.push(...words);
    } catch (err) {
      await fs.writeFile(
        path.join(dir, "transcribe-error.log"),
        `chunk@${timeOffset}: ${err instanceof Error ? err.message : String(err)}\n`,
        { flag: "a" },
      );
    }
  }

  allWords.sort((a, b) => a.start - b.start);
  const segments = wordsToSegments(allWords);
  const fullText = segments.map((s) => s.text).join(" ");
  const language = detectScriptLanguage(fullText);

  await fs.writeFile(
    path.join(dir, "transcript.json"),
    JSON.stringify({ language, segments, wordCount: allWords.length }, null, 2),
    "utf8",
  );

  return { segments, language };
}
