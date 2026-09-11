import fs from "fs/promises";

/**
 * RMS windows from a 16-bit mono WAV (clip or full-job audio.wav).
 */
export async function computeRmsWindows(
  wavPath: string,
  hopSec = 0.5,
): Promise<Array<{ t: number; rms: number }>> {
  const buf = await fs.readFile(wavPath);
  let offset = 12;
  let dataOffset = 44;
  let dataSize = buf.length - 44;
  let sampleRate = 16000;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      sampleRate = buf.readUInt32LE(offset + 12) || sampleRate;
    }
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const hop = Math.max(256, Math.round(sampleRate * hopSec));
  const out: Array<{ t: number; rms: number }> = [];
  const samples = Math.floor(dataSize / 2);
  for (let i = 0; i + hop <= samples; i += hop) {
    let acc = 0;
    for (let s = 0; s < hop; s++) {
      const v = buf.readInt16LE(dataOffset + (i + s) * 2) / 32768;
      acc += v * v;
    }
    out.push({ t: i / sampleRate, rms: Math.sqrt(acc / hop) });
  }
  return out;
}

export function meanRms(
  windows: Array<{ t: number; rms: number }>,
  start: number,
  end: number,
) {
  let sum = 0;
  let n = 0;
  for (const w of windows) {
    if (w.t >= start && w.t < end) {
      sum += w.rms;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}
