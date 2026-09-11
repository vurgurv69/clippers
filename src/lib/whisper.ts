/**
 * Global Whisper / ASR singleton — load once per Node process, reuse every job.
 */
import os from "os";

export const WHISPER_SAMPLE_RATE = 16_000;

type WhisperChunk = {
  text?: string;
  timestamp?: [number, number | null];
};

export type WhisperResult = {
  text?: string;
  chunks?: WhisperChunk[];
};

export type WhisperTranscriber = (
  audio: Float32Array | string | { data: Float32Array; sampling_rate: number },
  options?: Record<string, unknown>,
) => Promise<WhisperResult | WhisperResult[]>;

let transcriberPromise: Promise<WhisperTranscriber> | null = null;
let loadedModelId: string | null = null;
let warmStarted = false;

export function whisperModelForQuality(quality?: string) {
  const q = (quality || process.env.WHISPER_QUALITY || "fast").toLowerCase();
  if (process.env.WHISPER_MODEL?.trim()) return process.env.WHISPER_MODEL.trim();
  if (q === "best" || q === "balanced") return "Xenova/whisper-small";
  return "Xenova/whisper-tiny";
}

/**
 * Return the shared ASR pipeline. Never re-downloads while the model id matches.
 */
export async function getWhisperTranscriber(
  quality?: string,
): Promise<WhisperTranscriber> {
  const model = whisperModelForQuality(quality);
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
      return asr as unknown as WhisperTranscriber;
    } catch {
      const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        quantized: true,
      });
      loadedModelId = "Xenova/whisper-tiny";
      return asr as unknown as WhisperTranscriber;
    }
  })();

  return transcriberPromise;
}

/** Eager boot warm — call from instrumentation / first API hit. */
export function warmWhisper(quality?: string): Promise<void> {
  if (warmStarted && transcriberPromise) {
    return transcriberPromise.then(() => undefined).catch(() => undefined);
  }
  warmStarted = true;
  return getWhisperTranscriber(quality || "fast")
    .then(() => undefined)
    .catch((err) => {
      console.warn("[whisper] warm failed", err instanceof Error ? err.message : err);
      warmStarted = false;
    });
}

export function whisperLoadedModelId() {
  return loadedModelId;
}
