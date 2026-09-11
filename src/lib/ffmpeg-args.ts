import { toFfmpegPath } from "./binaries";
import type { AspectRatio, DownloadHint, LayoutMode } from "./types";
import { ASPECT_PRESETS } from "./types";

export const CANVAS: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "16:9": { w: 1920, h: 1080 },
};

export type FaceBox = { x: number; y: number; w: number; h: number };

export type DelogoBox = { x: number; y: number; w: number; h: number };

export type BuildFfmpegArgsOptions = {
  inputPath: string;
  outputPath: string;
  aspect: AspectRatio;
  layoutMode: LayoutMode | "fill" | "face-top";
  start?: number;
  /** Input-timeline end (use with `-ss`/`-to` for a precise range). */
  to?: number;
  duration?: number;
  assPath?: string;
  face?: FaceBox;
  srcW?: number;
  srcH?: number;
  hasAudio?: boolean;
  audioFilter?: string;
  videoCodecArgs?: string[];
  audioBr?: string;
  /** Blur TikTok / Reels handle + logo corners. Default on. */
  removeWatermark?: boolean;
  downloadHint?: DownloadHint;
  delogoBoxes?: DelogoBox[];
  /** Mask the bottom caption band (burn-in strip). */
  stripBurnIn?: boolean;
  /** 60fps output: blend interpolate, or simple fps duplicate. */
  fps60?: "off" | "blend" | "dup";
  /** Prefer bitstream copy for audio (falls back in the renderer). */
  copyAudio?: boolean;
  /** Force High Profile + CRF 17 + 60fps flags on the encode. */
  maxQuality?: boolean;
};

function even(n: number) {
  return Math.max(2, n - (n % 2));
}

function canvasSize(aspect: AspectRatio): { w: number; h: number } {
  return CANVAS[aspect] || ASPECT_PRESETS[aspect] || CANVAS["9:16"];
}

/** Keep delogo rectangles strictly inside the frame (ffmpeg requires a 1px inset). */
export function clampDelogoBox(box: DelogoBox, frameW: number, frameH: number): DelogoBox {
  const x = Math.max(1, Math.min(frameW - 4, Math.round(box.x)));
  const y = Math.max(1, Math.min(frameH - 4, Math.round(box.y)));
  const w = Math.max(8, Math.min(frameW - x - 1, Math.round(box.w)));
  const h = Math.max(8, Math.min(frameH - y - 1, Math.round(box.h)));
  return { x, y, w, h };
}

/**
 * Known TikTok / Instagram handle stamps: top-left username, bottom-right logo.
 * Coordinates are on the output canvas after fill/crop.
 */
export function socialWatermarkBoxes(
  frameW: number,
  frameH: number,
  opts?: { stripBurnIn?: boolean },
): DelogoBox[] {
  const pad = Math.max(2, Math.round(Math.min(frameW, frameH) * 0.012));
  const tl = clampDelogoBox(
    {
      x: pad,
      y: Math.max(pad, Math.round(frameH * 0.032)),
      w: Math.round(frameW * 0.3),
      h: Math.round(frameH * 0.058),
    },
    frameW,
    frameH,
  );
  const br = clampDelogoBox(
    {
      x: Math.round(frameW * 0.68),
      y: Math.round(frameH * 0.83),
      w: Math.round(frameW * 0.29),
      h: Math.round(frameH * 0.13),
    },
    frameW,
    frameH,
  );
  /** TikTok bounce logo travels a vertical strip on the right. */
  const bounce = clampDelogoBox(
    {
      x: Math.round(frameW * 0.86),
      y: Math.round(frameH * 0.22),
      w: Math.round(frameW * 0.12),
      h: Math.round(frameH * 0.42),
    },
    frameW,
    frameH,
  );
  const boxes = [tl, br, bounce];
  if (opts?.stripBurnIn) {
    boxes.push(
      clampDelogoBox(
        {
          x: Math.round(frameW * 0.08),
          y: Math.round(frameH * 0.78),
          w: Math.round(frameW * 0.84),
          h: Math.round(frameH * 0.16),
        },
        frameW,
        frameH,
      ),
    );
  }
  return boxes;
}

export function maxQualityVideoArgs(): string[] {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-level",
    "4.2",
    "-crf",
    "15",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "60",
  ];
}

export function delogoFilter(boxes: DelogoBox[]): string {
  return boxes
    .map((b) => `delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:show=0`)
    .join(",");
}

export function shouldRemoveWatermark(
  removeWatermark?: boolean,
  hint?: DownloadHint,
): boolean {
  if (removeWatermark === false) return false;
  if (removeWatermark === true) return true;
  return hint === "tiktok" || hint === "instagram" || hint === "auto";
}

/**
 * Blurred-background fill for horizontal → vertical (and any aspect).
 *
 * - BG: cover-crop to canvas, heavy gblur, slight darken
 * - FG: fit inside canvas (full frame visible, no zoom crop), centered
 */
export function fillFrameGraph(outW: number, outH: number): {
  filterComplex: string;
  mapVideo: string;
} {
  const w = even(outW);
  const h = even(outH);

  const bgScale =
    `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${w}:${h}:(iw-ow)/2:(ih-oh)/2`;

  // Unzoomed fit — preserve full picture; even size for yuv420p.
  const fgScale =
    `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `scale=trunc(iw/2)*2:trunc(ih/2)*2`;

  return {
    filterComplex: [
      `[0:v]split=2[bg][fg]`,
      `[bg]${bgScale},gblur=sigma=30:steps=4,eq=brightness=-0.15,setsar=1,format=yuv420p[back]`,
      `[fg]${fgScale},setsar=1,format=yuv420p[mid]`,
      `[back][mid]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:format=auto,setsar=1,format=yuv420p[laid]`,
    ].join(";"),
    mapVideo: "[laid]",
  };
}

/**
 * Face-top split-screen (podcast / facecam + gameplay).
 * 1080×1920 → top 1080×720 speaker · bottom 1080×1200 content.
 * Sharp panels only — no gblur plate. Facecam framed left-biased.
 */
export function faceTopGraph(
  outW: number,
  outH: number,
  face?: FaceBox,
): { filterComplex: string; mapVideo: string } {
  const w = even(outW);
  const h = even(outH);
  const faceH =
    w === 1080 && h === 1920 ? 720 : even(Math.round(h * (720 / 1920)));
  const gameH = even(h - faceH);

  // Stream A — facecam. Prefer detected box, nudged left; else upper-left band.
  let faceCrop: string;
  if (face) {
    const fw = even(Math.max(48, face.w));
    const fh = even(Math.max(48, face.h));
    const nudge = Math.round(face.w * 0.28);
    const fx = even(Math.max(0, face.x - nudge));
    const fy = even(Math.max(0, face.y));
    faceCrop = `crop=${fw}:${fh}:${fx}:${fy}`;
  } else {
    // ~55% width starting near left edge
    faceCrop = `crop=iw*0.55:ih*0.45:iw*0.05:0`;
  }

  // Stream B — gameplay / main (lower band). Full-width, sharp cover.
  const gameCrop = `crop=iw:ih*0.62:0:ih*0.38`;

  // Lanczos + light unsharp; left bias after scale: -(iw-ow)*0.32
  const faceScale =
    `scale=${w}:${faceH}:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int,` +
    `crop=${w}:${faceH}:(iw-ow)/2-(iw-ow)*0.32:(ih-oh)/2,` +
    `unsharp=5:5:0.8:5:5:0.0,setsar=1,format=yuv420p`;
  const gameScale =
    `scale=${w}:${gameH}:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int,` +
    `crop=${w}:${gameH}:(iw-ow)/2:(ih-oh)/2,setsar=1,format=yuv420p`;

  return {
    filterComplex: [
      `[0:v]split=2[vface][vgame]`,
      `[vface]${faceCrop},${faceScale}[face]`,
      `[vgame]${gameCrop},${gameScale}[game]`,
      // Exact 720+1200 stack on opaque panels — black letterbox only if sizes mismatch; no gblur.
      `[face][game]vstack=inputs=2,setsar=1,format=yuv420p[laid]`,
    ].join(";"),
    mapVideo: "[laid]",
  };
}

export function buildLayoutFiltergraph(opts: {
  aspect: AspectRatio;
  layoutMode: LayoutMode | "fill" | "face-top";
  face?: FaceBox;
  assPath?: string;
  removeWatermark?: boolean;
  downloadHint?: DownloadHint;
  delogoBoxes?: DelogoBox[];
  stripBurnIn?: boolean;
  fps60?: "off" | "blend" | "dup";
}): { filterComplex: string; mapVideo: string } {
  const { w, h } = canvasSize(opts.aspect);
  const mode = opts.layoutMode === "face-top" ? "face-top" : "fill";
  const base =
    mode === "face-top"
      ? faceTopGraph(w, h, opts.face)
      : fillFrameGraph(w, h);

  let graph = base.filterComplex;
  let label = base.mapVideo.replace(/[[\]]/g, "");

  // Delogo smudges look soft/blurry on split layouts — skip for face-top.
  if (
    mode !== "face-top" &&
    shouldRemoveWatermark(opts.removeWatermark, opts.downloadHint)
  ) {
    const boxes = opts.delogoBoxes?.length
      ? opts.delogoBoxes.map((b) => clampDelogoBox(b, w, h))
      : socialWatermarkBoxes(w, h, { stripBurnIn: opts.stripBurnIn });
    const delogo = delogoFilter(boxes);
    if (delogo) {
      graph = `${graph};[${label}]${delogo}[clean]`;
      label = "clean";
    }
  }

  // minterpolate blend softens the whole frame — never use on face-top.
  if (mode !== "face-top" && opts.fps60 === "blend") {
    graph = `${graph};[${label}]minterpolate=fps=60:mi_mode=blend[fps]`;
    label = "fps";
  } else if (opts.fps60 === "dup") {
    graph = `${graph};[${label}]fps=60[fps]`;
    label = "fps";
  }

  if (!opts.assPath) {
    return { filterComplex: graph, mapVideo: `[${label}]` };
  }

  const ass = `ass='${toFfmpegPath(opts.assPath)}'`;
  return {
    filterComplex: `${graph};[${label}]${ass}[vout]`,
    mapVideo: "[vout]",
  };
}

/**
 * Full ffmpeg argv for one clip encode (layout + optional delogo + burned ASS).
 */
export function buildFFmpegArgs(options: BuildFfmpegArgsOptions): string[] {
  const {
    inputPath,
    outputPath,
    aspect,
    layoutMode,
    start,
    to,
    duration,
    assPath,
    face,
    hasAudio = true,
    audioFilter,
    videoCodecArgs,
    audioBr = "224k",
    removeWatermark,
    downloadHint,
    delogoBoxes,
    stripBurnIn,
    fps60,
    copyAudio,
    maxQuality,
  } = options;

  const graph = buildLayoutFiltergraph({
    aspect,
    layoutMode,
    face,
    assPath,
    removeWatermark,
    downloadHint,
    delogoBoxes,
    stripBurnIn,
    fps60,
  });

  const args: string[] = ["-y"];
  if (start != null && start >= 0) {
    args.push("-ss", String(start));
  }
  if (to != null && to > (start ?? 0)) {
    args.push("-to", String(to));
  }
  args.push("-i", inputPath);
  if ((to == null || to <= (start ?? 0)) && duration != null && duration > 0) {
    args.push("-t", String(duration));
  }
  args.push("-avoid_negative_ts", "make_zero");
  // Video-only filter_complex — audio is mapped from the source for pristine sync.
  args.push("-filter_complex", graph.filterComplex, "-map", graph.mapVideo);

  if (hasAudio) {
    args.push("-map", "0:a:0");
    if (copyAudio) {
      args.push("-c:a", "copy");
    } else {
      // Soft resample keeps A/V locked without touching the layout graph.
      const af = audioFilter
        ? audioFilter
        : "aresample=48000:async=1:first_pts=0";
      args.push("-af", af);
      args.push(
        "-c:a",
        "aac",
        "-b:a",
        maxQuality ? "320k" : audioBr || "320k",
        "-ar",
        "48000",
      );
    }
  } else {
    args.push("-an");
  }

  if (videoCodecArgs?.length) {
    args.push(...videoCodecArgs);
  } else if (maxQuality) {
    args.push(...maxQualityVideoArgs());
  } else {
    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p");
  }

  args.push("-sn", "-movflags", "+faststart", outputPath);
  return args;
}

/** Second-pass burn: overlay karaoke ASS on an already-cut clip, copy audio. */
export function buildAssBurnArgs(opts: {
  inputPath: string;
  outputPath: string;
  assPath: string;
  videoCodecArgs?: string[];
}): string[] {
  const ass = `ass='${toFfmpegPath(opts.assPath)}'`;
  return [
    "-y",
    "-i",
    opts.inputPath,
    "-vf",
    ass,
    ...(opts.videoCodecArgs?.length
      ? opts.videoCodecArgs
      : ["-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p"]),
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    opts.outputPath,
  ];
}
