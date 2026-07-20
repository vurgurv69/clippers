import fs from "fs/promises";
import path from "path";
import { ffmpegPath, ffprobePath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import type { EditSpec, EditSegment, TextOverlay } from "./edit-types";

type ClipInfo = {
  width: number;
  height: number;
  hasAudio: boolean;
  duration: number;
};

export async function probeClip(filePath: string): Promise<ClipInfo> {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height:format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const data = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const streams = data.streams || [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  return {
    width: video?.width || 1080,
    height: video?.height || 1920,
    hasAudio,
    duration: Number.parseFloat(data.format?.duration || "0") || 0,
  };
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Sorted, sane list of kept segments. */
function normalizeSegments(spec: EditSpec, duration: number): EditSegment[] {
  const segs = (spec.segments || [])
    .map((s) => ({
      id: s.id,
      start: clamp(s.start, 0, duration),
      end: clamp(s.end, 0, duration),
    }))
    .filter((s) => s.end - s.start > 0.05)
    .sort((a, b) => a.start - b.start);
  return segs.length ? segs : [{ id: "seg-1", start: 0, end: duration }];
}

/** Map a point in ORIGINAL clip time to the FINAL (post-cut) timeline. */
function mapToFinal(t: number, segs: EditSegment[]): number | null {
  let acc = 0;
  for (const s of segs) {
    if (t < s.start) return acc; // point sits in a removed gap → snap to cut
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return acc;
}

function hexToAssColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const rgb = m ? m[1] : "FFFFFF";
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function buildOverlayAss(
  texts: TextOverlay[],
  info: ClipInfo,
  segs: EditSegment[],
  total: number,
): string {
  const header = [
    "[Script Info]",
    "Title: Clippers Editor Overlay",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${info.width}`,
    `PlayResY: ${info.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Overlay,Arial Black,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,0,5,10,10,10,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const lines: string[] = [];
  for (const t of texts) {
    const fs0 = mapToFinal(t.start, segs);
    const fe0 = mapToFinal(t.end, segs);
    if (fs0 == null || fe0 == null) continue;
    const start = clamp(fs0, 0, total);
    const end = clamp(fe0, 0, total);
    if (end - start < 0.05) continue;

    const px = Math.round(clamp(t.x, 0, 1) * info.width);
    const py = Math.round(clamp(t.y, 0, 1) * info.height);
    const size = Math.round(clamp(t.size, 0.02, 0.3) * info.width);
    const color = hexToAssColor(t.color);
    const bold = t.bold ? 1 : 0;
    const border = t.background ? "\\bord0\\shad0\\3a&H00&\\4a&H40&" : "\\bord4\\shad0";
    const box = t.background ? "\\an5\\3c&H000000&\\bord10\\shad0" : "\\an5";
    const style =
      `{\\pos(${px},${py})${box}\\fs${size}\\b${bold}\\1c${color}${border ? "" : ""}}`;
    lines.push(
      `Dialogue: 0,${assTime(start)},${assTime(end)},Overlay,,0,0,0,,${style}${escapeAss(t.text)}`,
    );
  }

  return [...header, ...lines].join("\n");
}

/**
 * Build the ffmpeg filter graph + args for an edit and render it.
 * Returns the output file name (inside the clips dir).
 */
export async function renderEdit(opts: {
  jobId: string;
  clipId: string;
  spec: EditSpec;
}): Promise<{ outName: string }> {
  const { jobId, clipId, spec } = opts;
  const clipsDir = path.join(jobDir(jobId), "clips");
  const srcName = `${clipId}.mp4`;
  const srcPath = path.join(clipsDir, srcName);

  const info = await probeClip(srcPath);
  const segs = normalizeSegments(spec, info.duration);
  const total = segs.reduce((n, s) => n + (s.end - s.start), 0);

  const trans = spec.cutTransition || "none";
  const cutD = clamp(spec.cutTransitionDuration ?? 0.4, 0, 2);
  const useCutFade = trans !== "none" && cutD > 0 && segs.length > 1;
  const fadeColor = trans === "fadewhite" ? "white" : "black";

  const fadeIn = clamp(spec.fadeIn ?? 0, 0, Math.min(5, total));
  const fadeOut = clamp(spec.fadeOut ?? 0, 0, Math.min(5, total));

  // --- video chain ---
  const vParts: string[] = [];
  const vLabels: string[] = [];
  segs.forEach((s, i) => {
    const len = s.end - s.start;
    let chain = `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS`;
    if (useCutFade) {
      if (i > 0) chain += `,fade=t=in:st=0:d=${cutD}:color=${fadeColor}`;
      if (i < segs.length - 1)
        chain += `,fade=t=out:st=${Math.max(0, len - cutD).toFixed(3)}:d=${cutD}:color=${fadeColor}`;
    }
    const label = `v${i}`;
    vParts.push(`${chain}[${label}]`);
    vLabels.push(`[${label}]`);
  });

  let vTail: string;
  if (segs.length > 1) {
    vParts.push(`${vLabels.join("")}concat=n=${segs.length}:v=1:a=0[vcat]`);
    vTail = "vcat";
  } else {
    vTail = vLabels[0].replace(/[[\]]/g, "");
  }

  const b = clamp(spec.color?.brightness ?? 1, 0, 2) - 1; // eq additive
  const c = clamp(spec.color?.contrast ?? 1, 0, 2);
  const sat = clamp(spec.color?.saturation ?? 1, 0, 3);
  vParts.push(
    `[${vTail}]eq=brightness=${b.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${sat.toFixed(3)}[veq]`,
  );

  let curV = "veq";
  const texts = (spec.texts || []).filter((t) => t.text.trim());
  let assName: string | null = null;
  if (texts.length) {
    assName = `${clipId}-overlay.ass`;
    const ass = buildOverlayAss(texts, info, segs, total);
    await fs.writeFile(path.join(clipsDir, assName), `\ufeff${ass}`, "utf8");
    vParts.push(`[${curV}]ass=${assName}[vtxt]`);
    curV = "vtxt";
  }

  const vFades: string[] = [];
  if (fadeIn > 0) vFades.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0)
    vFades.push(
      `fade=t=out:st=${Math.max(0, total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    );
  if (vFades.length) {
    vParts.push(`[${curV}]${vFades.join(",")}[vout]`);
    curV = "vout";
  } else {
    vParts.push(`[${curV}]null[vout]`);
    curV = "vout";
  }

  // --- audio chain ---
  const musicPath = spec.audio?.filename
    ? path.join(jobDir(jobId), "edit-assets", spec.audio.filename)
    : null;
  let hasMusic = false;
  if (musicPath) {
    try {
      await fs.access(musicPath);
      hasMusic = true;
    } catch {
      hasMusic = false;
    }
  }

  const aParts: string[] = [];
  let audioOut: string | null = null;
  const origVol = clamp(spec.audio?.originalVolume ?? 1, 0, 2);
  const musicVol = clamp(spec.audio?.volume ?? 1, 0, 2);

  if (info.hasAudio && origVol > 0) {
    segs.forEach((s, i) => {
      aParts.push(
        `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
      );
    });
    if (segs.length > 1) {
      aParts.push(
        `${segs.map((_, i) => `[a${i}]`).join("")}concat=n=${segs.length}:v=0:a=1[acat]`,
      );
      aParts.push(`[acat]volume=${origVol.toFixed(3)}[aorig]`);
    } else {
      aParts.push(`[a0]volume=${origVol.toFixed(3)}[aorig]`);
    }
    audioOut = "aorig";
  }

  const inputs: string[] = ["-i", srcPath];
  if (hasMusic) {
    inputs.push("-i", musicPath!);
    const musicIdx = 1;
    aParts.push(
      `[${musicIdx}:a]atrim=start=0:end=${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVol.toFixed(3)}[amus]`,
    );
    if (audioOut) {
      aParts.push(`[${audioOut}][amus]amix=inputs=2:duration=first:dropout_transition=0[amixed]`);
      audioOut = "amixed";
    } else {
      audioOut = "amus";
    }
  }

  if (audioOut) {
    const aFades: string[] = [];
    if (fadeIn > 0) aFades.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
    if (fadeOut > 0)
      aFades.push(
        `afade=t=out:st=${Math.max(0, total - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
      );
    if (aFades.length) {
      aParts.push(`[${audioOut}]${aFades.join(",")}[aout]`);
      audioOut = "aout";
    }
  }

  const filterComplex = [...vParts, ...aParts].join(";");

  const outName = `${clipId}-edit-${Date.now()}.mp4`;
  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
  ];
  if (audioOut) {
    args.push("-map", `[${audioOut}]`);
  } else {
    args.push("-an");
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  );
  if (audioOut) args.push("-c:a", "aac", "-b:a", "192k");
  args.push(outName);

  await runCommand(ffmpegPath(), args, { cwd: clipsDir });

  if (assName) {
    try {
      await fs.unlink(path.join(clipsDir, assName));
    } catch {
      // ignore
    }
  }

  return { outName };
}
