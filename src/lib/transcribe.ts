import fs from "fs/promises";
import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import { detectScriptLanguage } from "./topic-title";
import type { TranscriptSegment, TranscriptWord } from "./types";
import {
  getWhisperTranscriber,
  whisperLoadedModelId,
  WHISPER_SAMPLE_RATE,
  type WhisperResult,
  type WhisperTranscriber,
} from "./whisper";

export { warmWhisper, WHISPER_SAMPLE_RATE as SAMPLE_RATE } from "./whisper";

type WhisperChunk = {
  text?: string;
  timestamp?: [number, number | null];
};

type Transcriber = WhisperTranscriber;

const SAMPLE_RATE = WHISPER_SAMPLE_RATE;
/** Chunk size for ASR windows. */
const CHUNK_SECONDS = 30;
/**
 * Only skip near-digital silence. Soft speech / whispers must still be transcribed
 * so trailing dialogue and quiet lines are not dropped.
 */
const SILENCE_ENERGY = 0.0028;
/**
 * Cap spoken ASR seconds (override with WHISPER_MAX_SECONDS).
 * Default 0 = no cap (full video). Positive values still allow long jobs without OOM.
 */
const MAX_ASR_SECONDS = Number(process.env.WHISPER_MAX_SECONDS || 0);

async function getTranscriber(quality?: string): Promise<Transcriber> {
  return getWhisperTranscriber(quality);
}

async function extractWav(videoPath: string, wavPath: string, maxSeconds?: number) {
  const args = [
    "-y",
    "-i",
    videoPath,
    ...(maxSeconds && maxSeconds > 0 ? ["-t", String(maxSeconds)] : []),
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-c:a",
    "pcm_s16le",
    "-threads",
    "0",
    wavPath,
  ];
  await runCommand(ffmpegPath(), args);
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

function asWhisperResult(raw: unknown): WhisperResult {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object") return {};
  return value as WhisperResult;
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
  const seconds = slice.length / SAMPLE_RATE;
  const run = async (timestamps: boolean | "word", language?: string) => {
    const opts: Record<string, unknown> = {
      return_timestamps: timestamps,
      task: "transcribe",
    };
    // Already sliced ~30s — extra Whisper windowing on an object (not a
    // Float32Array) used to produce zero audio and empty captions.
    if (seconds > 32) {
      opts.chunk_length_s = 30;
      opts.stride_length_s = 5;
    }
    if (language) opts.language = language;
    else if (langHint) opts.language = langHint;
    return asWhisperResult(await transcriber(slice, opts));
  };

  let result: WhisperResult;
  try {
    result = await run("word");
  } catch {
    result = await run(true);
  }

  let chunks = resultToChunks(result, seconds);

  if (!chunks.length) {
    for (const language of ["english", "arabic"] as const) {
      if (langHint && language !== langHint) continue;
      try {
        const retry = await run("word", language);
        chunks = resultToChunks(retry, seconds);
      } catch {
        const retry = await run(true, language);
        chunks = resultToChunks(retry, seconds);
      }
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
  // Only decode the ASR window — avoids reading hour-long sources into RAM.
  const extractCap =
    MAX_ASR_SECONDS > 0 ? Math.max(60, MAX_ASR_SECONDS + 30) : undefined;
  await extractWav(videoPath, wavPath, extractCap);
  await onProgress?.(32, "Speech model ready…");

  const audio = await wavToFloat32(wavPath);
  const transcriber = await getTranscriber(whisperQuality);
  const chunkSamples = CHUNK_SECONDS * SAMPLE_RATE;
  const allWords: TranscriptWord[] = [];
  const totalChunks = Math.max(1, Math.ceil(audio.length / chunkSamples));
  let asrSeconds = 0;
  let langHint: "arabic" | "english" | null = null;
  let processed = 0;

  for (let start = 0; start < audio.length; start += chunkSamples) {
    if (MAX_ASR_SECONDS > 0 && asrSeconds >= MAX_ASR_SECONDS) break;

    const end = Math.min(audio.length, start + chunkSamples);
    const slice = audio.subarray(start, end);
    let energy = 0;
    let peak = 0;
    let samples = 0;
    for (let i = 0; i < slice.length; i += 160) {
      const a = Math.abs(slice[i]);
      energy += a;
      if (a > peak) peak = a;
      samples += 1;
    }
    processed += 1;
    const mean = samples ? energy / samples : 0;
    // Only skip true digital silence — keep soft / trailing speech.
    if (mean < SILENCE_ENERGY && peak < SILENCE_ENERGY * 4) {
      if (processed % 2 === 0) {
        const pct = 32 + Math.round((processed / totalChunks) * 18);
        await onProgress?.(
          Math.min(50, pct),
          `Listening… skipped silence (${Math.round(start / SAMPLE_RATE)}s)`,
        );
      }
      continue;
    }

    const timeOffset = start / SAMPLE_RATE;
    let chunkOk = false;
    for (let attempt = 0; attempt < 2 && !chunkOk; attempt++) {
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
        chunkOk = true;
      } catch (err) {
        await fs.writeFile(
          path.join(dir, "transcribe-error.log"),
          `chunk@${timeOffset} attempt=${attempt + 1}: ${err instanceof Error ? err.message : String(err)}\n`,
          { flag: "a" },
        );
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
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
        model: whisperLoadedModelId() || process.env.WHISPER_MODEL || "Xenova/whisper-tiny",
      },
      null,
      2,
    ),
    "utf8",
  );

  return { segments, language };
}

/**
 * Transcribe a WAV that already matches a cut clip — timestamps start at 0.
 */
export async function transcribeWavFile(opts: {
  wavPath: string;
  whisperQuality?: string;
  /** Added to every word. Use 0 for clip-local audio. */
  timeOffset?: number;
}): Promise<TranscriptSegment[]> {
  const timeOffset = opts.timeOffset ?? 0;
  const audio = await wavToFloat32(opts.wavPath);
  if (audio.length < SAMPLE_RATE / 4) return [];
  const transcriber = await getTranscriber(opts.whisperQuality);
  const { words } = await transcribeChunk(transcriber, audio, timeOffset, null);
  if (words.length) return wordsToSegments(words);
  return [];
}

/** Extract 16 kHz mono PCM from a cut clip (or any media). */
export async function extractClipWav(mediaPath: string, wavPath: string) {
  await runCommand(ffmpegPath(), [
    "-y",
    "-i",
    mediaPath,
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

/**
 * Listen to one clip window and return what was actually said.
 * Used when the full-video transcript missed that part of the audio.
 */
export async function transcribeClipWindow(opts: {
  jobId: string;
  videoPath: string;
  start: number;
  end: number;
  whisperQuality?: string;
  /** When true, timestamps stay clip-relative (t=0). */
  zeroBased?: boolean;
}): Promise<TranscriptSegment[]> {
  const duration = Math.max(0.4, opts.end - opts.start);
  const dir = jobDir(opts.jobId);
  const wavPath = path.join(dir, `clip-${opts.start.toFixed(1)}-${opts.end.toFixed(1)}.wav`);
  await runCommand(ffmpegPath(), [
    "-y",
    "-ss",
    String(Math.max(0, opts.start)),
    "-t",
    String(duration),
    "-i",
    opts.videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);

  return transcribeWavFile({
    wavPath,
    whisperQuality: opts.whisperQuality,
    timeOffset: opts.zeroBased ? 0 : opts.start,
  });
}
