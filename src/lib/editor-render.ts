import fs from "fs/promises";
import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { ASPECT_PRESETS } from "./types";
import {
  assetsDir,
  exportsDir,
  getProject,
  workDir,
} from "./editor-project";
import type {
  ClipEffect,
  ClipKeyframe,
  ExportCodec,
  ExportOptions,
  MusicTrack,
  ProjectAsset,
  ProjectSpec,
  TextOverlay,
  TimelineClip,
  TransitionKind,
} from "./editor-types";
import {
  clipLane,
  clipLength,
  clipSourceLength,
  DEFAULT_EXPORT,
  easeProgress,
  flattenCompounds,
  resolveMulticam,
  textHasContent,
} from "./editor-types";
import { buildTimelineKaraokeAss } from "./captions";
import { loadCachedTranscript } from "./media-activity";
import type { TranscriptWord } from "./types";
import { computeTimeline } from "./studio-timeline";
import { videoEncodeArgs } from "./hw-encode";

const FPS = 30;
const SAMPLE_RATE = 44100;

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Build a piecewise-linear ffmpeg expression for a keyframed property.
 * Uses `T` (seconds) so it works with geq / volume=…:eval=frame.
 * Commas are escaped (`\,`) for filter_complex safety.
 * Optional `valueClamp` keeps every sample (and the final expr) in range.
 */
function keyframeExpr(
  keys: ClipKeyframe[] | undefined,
  prop: "opacity" | "volume" | "brightness" | "x" | "y" | "scaleX" | "scaleY" | "rotation",
  len: number,
  _fallback: number,
  valueClamp?: [number, number],
): string | null {
  const sorted = (keys || [])
    .filter((k) => typeof k[prop] === "number")
    .slice()
    .sort((a, b) => a.t - b.t);
  if (!sorted.length) return null;

  const clampV = (v: number) =>
    valueClamp ? clamp(v, valueClamp[0], valueClamp[1]) : v;

  const dur = Math.max(0.001, len);
  // Densify segments so easeIn/Out curves bake into piecewise-linear ffmpeg exprs.
  const pts: { t: number; v: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const k = sorted[i];
    const tAbs = clamp(k.t, 0, 1) * dur;
    const v = clampV(k[prop] as number);
    if (i === 0) {
      pts.push({ t: tAbs, v });
      continue;
    }
    const prev = sorted[i - 1];
    const t0 = clamp(prev.t, 0, 1) * dur;
    const v0 = clampV(prev[prop] as number);
    const ease = k.ease || prev.ease || "linear";
    const bez = k.bezier || prev.bezier;
    const steps = ease === "linear" ? 1 : ease === "bezier" ? 10 : 6;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const eu = easeProgress(ease, u, bez);
      pts.push({
        t: t0 + (tAbs - t0) * u,
        v: clampV(v0 + (v - v0) * eu),
      });
    }
  }

  if (pts.length === 1) return pts[0].v.toFixed(4);

  // Nested if from the end: hold last value past the final key.
  let expr = pts[pts.length - 1].v.toFixed(4);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const span = Math.max(1e-4, b.t - a.t);
    const dv = b.v - a.v;
    const lerp = `(${a.v.toFixed(4)}+(${dv.toFixed(4)})*(T-${a.t.toFixed(4)})/${span.toFixed(4)})`;
    expr = `if(lt(T\\,${a.t.toFixed(4)})\\,${a.v.toFixed(4)}\\,if(lt(T\\,${b.t.toFixed(4)})\\,${lerp}\\,${expr}))`;
  }
  if (valueClamp) {
    return `max(${valueClamp[0].toFixed(4)}\\,min(${valueClamp[1].toFixed(4)}\\,${expr}))`;
  }
  return expr;
}

/** Map our transition ids to ffmpeg xfade transition names (all validated). */
function xfadeName(t: TransitionKind): string {
  switch (t) {
    case "crossfade":
      return "fade";
    case "dissolve":
      return "dissolve";
    case "zoom":
      return "zoomin";
    case "zoomout":
      return "fade";
    case "slide":
      return "slideleft";
    case "slideright":
      return "slideright";
    case "slideup":
      return "slideup";
    case "slidedown":
      return "slidedown";
    case "push":
      return "slideright";
    case "pull":
      return "slideleft";
    case "whip":
      return "smoothleft";
    case "blur":
      return "hblur";
    case "spin":
      return "circleopen";
    case "warp":
      return "distance";
    case "liquid":
      return "smoothup";
    case "morph":
      return "smoothright";
    case "glitch":
      return "pixelize";
    case "shake":
      return "dissolve";
    case "filmburn":
      return "fadegrays";
    case "circlewipe":
    case "iris":
      return "circleopen";
    case "clockwipe":
      return "radial";
    case "pageturn":
      return "diagtl";
    case "cube":
      return "squeezeh";
    case "flip":
      return "squeezev";
    case "stretch":
      return "squeezeh";
    case "wipeup":
      return "wipeup";
    case "wipedown":
      return "wipedown";
    case "wipeleft":
      return "wipeleft";
    case "wiperight":
      return "wiperight";
    case "fadeblack":
      return "fadeblack";
    case "fadewhite":
      return "fadewhite";
    case "flash":
      return "fadewhite";
    default:
      return "fade";
  }
}

/** Build an atempo chain for an arbitrary speed factor (each stage is 0.5..2). */
function atempoChain(speed: number): string[] {
  let s = clamp(speed, 0.25, 4);
  const stages: string[] = [];
  // atempo only accepts 0.5..2 per instance, so decompose bigger factors.
  while (s > 2.0 + 1e-6) {
    stages.push("atempo=2.0");
    s /= 2.0;
  }
  while (s < 0.5 - 1e-6) {
    stages.push("atempo=0.5");
    s /= 0.5;
  }
  stages.push(`atempo=${s.toFixed(4)}`);
  return stages;
}

/**
 * Translate the clip's stackable effects into linear ffmpeg filters, applied
 * in order. Each entry is a single-input/single-output filter so they chain
 * cleanly onto the main clip filter graph.
 */
function effectVideoFilters(effects: ClipEffect[] | undefined, w: number, h: number): string[] {
  if (!effects || !effects.length) return [];
  const out: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const a = clamp(fx.amount ?? 0, 0, 100) / 100;
    switch (fx.kind) {
      case "blur":
        if (a > 0) out.push(`gblur=sigma=${(a * 20).toFixed(2)}`);
        break;
      case "sharpen":
        if (a > 0) out.push(`unsharp=5:5:${(a * 3).toFixed(2)}:5:5:0`);
        break;
      case "grain":
        if (a > 0) out.push(`noise=alls=${Math.round(a * 60)}:allf=t+u`);
        break;
      case "pixelate": {
        const f = 1 + a * 15; // 1..16
        if (f > 1.05) {
          const dw = Math.max(8, Math.round(w / f));
          const dh = Math.max(8, Math.round(h / f));
          out.push(`scale=${dw}:${dh}:flags=neighbor`, `scale=${w}:${h}:flags=neighbor`);
        }
        break;
      }
      case "rgbsplit": {
        const s = Math.round(a * 12);
        if (s > 0) out.push(`rgbashift=rh=${s}:bh=-${s}`);
        break;
      }
      case "hue": {
        const deg = Math.round(a * 360);
        if (deg !== 0) out.push(`hue=h=${deg}`);
        break;
      }
      case "vignette": {
        const angle = Math.PI / 5 + a * (Math.PI / 4);
        out.push(`vignette=angle=${angle.toFixed(4)}`);
        break;
      }
      case "motionblur": {
        const frames = Math.max(2, Math.round(2 + a * 6));
        out.push(`tmix=frames=${frames}`);
        break;
      }
      case "emboss":
        out.push(
          "convolution='-2 -1 0 -1 1 1 0 1 2':'-2 -1 0 -1 1 1 0 1 2':'-2 -1 0 -1 1 1 0 1 2':'0 0 0 0 1 0 0 0 0'",
        );
        break;
      case "mirror":
        out.push("hflip");
        break;
      case "glow":
        if (a > 0) {
          out.push(`gblur=sigma=${(a * 10).toFixed(2)}`);
          out.push(`eq=brightness=${(a * 0.1).toFixed(3)}:saturation=${(1 + a * 0.2).toFixed(3)}`);
        }
        break;
      case "bloom":
        if (a > 0) {
          // Soft highlight bloom: blur + lift mids (approximates WebGL bloom add)
          out.push(`gblur=sigma=${(a * 14).toFixed(2)}`);
          out.push(
            `eq=brightness=${(a * 0.16).toFixed(3)}:contrast=${(1 + a * 0.12).toFixed(3)}:saturation=${(1 + a * 0.3).toFixed(3)}`,
          );
        }
        break;
      case "shadow":
        if (a > 0) out.push(`vignette=angle=${(Math.PI / 6 + a * 0.6).toFixed(4)}`);
        break;
      case "shake": {
        const amp = Math.max(1, Math.round(a * 18));
        out.push(
          `crop=w=iw-${amp * 2}:h=ih-${amp * 2}:x='${amp}+${amp}*sin(n/3)':y='${amp}+${amp}*cos(n/5)'`,
          `scale=${w}:${h}`,
        );
        break;
      }
      case "wave":
        if (a > 0) {
          const amp = Math.max(2, Math.round(a * 10));
          out.push(
            `crop=w=iw-${amp * 2}:h=ih-${amp * 2}:x='${amp}+${amp}*sin(n/4)':y='${amp}+${amp}*sin(n/7)'`,
            `scale=${w}:${h}`,
          );
        }
        break;
      case "tint":
        if (a > 0) out.push(`colorbalance=gm=${(a * 0.35).toFixed(3)}:bm=${(-a * 0.15).toFixed(3)}`);
        break;
      case "posterize":
        if (a > 0) {
          out.push(
            `eq=contrast=${(1 + a * 0.8).toFixed(2)}:saturation=${(1 - a * 0.35).toFixed(2)}`,
            `unsharp=5:5:${(-a).toFixed(2)}:5:5:0`,
          );
        }
        break;
      case "negate":
        out.push("negate");
        break;
    }
  }
  return out;
}

/** Build the color + fade video filter for a single normalized clip. */
function clipVideoFilter(clip: TimelineClip, w: number, h: number, len: number): string {
  const b = clamp(clip.color.brightness, 0, 2) - 1;
  const c = clamp(clip.color.contrast, 0, 2);
  const s = clamp(clip.color.saturation, 0, 3);
  const sharpen = clamp(clip.color.sharpen ?? 0, 0, 2);
  const vignette = clamp(clip.color.vignette ?? 0, 0, 1);
  const speed = clamp(clip.speed ?? 1, 0.25, 4);
  // Pro grading params (neutral at 0)
  const exposure = clamp(clip.color.exposure ?? 0, -100, 100) / 100;
  const temperature = clamp(clip.color.temperature ?? 0, -100, 100) / 100;
  const tint = clamp(clip.color.tint ?? 0, -100, 100) / 100;
  const highlights = clamp(clip.color.highlights ?? 0, -100, 100) / 100;
  const shadows = clamp(clip.color.shadows ?? 0, -100, 100) / 100;
  const whites = clamp(clip.color.whites ?? 0, -100, 100) / 100;
  const blacks = clamp(clip.color.blacks ?? 0, -100, 100) / 100;
  const curve = clamp(clip.color.curve ?? 0, -100, 100) / 100;
  const parts: string[] = [];
  // Speed: retime source PTS. >1 = faster (shorter), <1 = slower (longer).
  if (Math.abs(speed - 1) > 1e-3) {
    parts.push(`setpts=${(1 / speed).toFixed(5)}*PTS`);
  }
  // Camera shake reduction (Phase 27) — mild overscale hides deshake edges.
  const stabilize = clamp(clip.stabilize ?? 0, 0, 1);
  if (stabilize > 0.02) {
    const rx = Math.round(16 + stabilize * 48);
    const ry = Math.round(16 + stabilize * 48);
    const over = (1 + stabilize * 0.08).toFixed(3);
    parts.push(
      `deshake=rx=${rx}:ry=${ry}:edge=mirror`,
      `scale=iw*${over}:ih*${over}`,
      `crop=iw/${over}:ih/${over}`,
    );
  }
  // exposure lifts mid gamma (gamma 0.6..1.8 across the range)
  const gamma = exposure >= 0 ? 1 + exposure * 0.8 : 1 + exposure * 0.4;
  const tr = clip.transform;
  const sx = clamp(tr?.scaleX ?? 1, 0.1, 3);
  const sy = clamp(tr?.scaleY ?? 1, 0.1, 3);
  const rot = clamp(tr?.rotation ?? 0, -180, 180);
  const ox = clamp(tr?.x ?? 0, -1, 1);
  const oy = clamp(tr?.y ?? 0, -1, 1);
  const opacity = clamp(tr?.opacity ?? 1, 0, 1);
  const oxExpr = keyframeExpr(clip.keyframes, "x", len, ox);
  const oyExpr = keyframeExpr(clip.keyframes, "y", len, oy);
  const rotExpr = keyframeExpr(clip.keyframes, "rotation", len, rot);
  const sxExpr = keyframeExpr(clip.keyframes, "scaleX", len, sx, [0.1, 3]);
  const syExpr = keyframeExpr(clip.keyframes, "scaleY", len, sy, [0.1, 3]);
  const briKf = keyframeExpr(clip.keyframes, "brightness", len, clip.color.brightness);
  const hueShift = clamp(clip.color.hueShift ?? 0, -180, 180);
  const lightness = clamp(clip.color.lightness ?? 0, -100, 100) / 100;
  // Cover the frame, then crop with position offset (x/y shift the crop window).
  const cropX = oxExpr
    ? `(in_w-${w})/2-((${oxExpr}))*${w}/2`
    : `(in_w-${w})/2-(${ox.toFixed(4)})*${w}/2`;
  const cropY = oyExpr
    ? `(in_h-${h})/2-((${oyExpr}))*${h}/2`
    : `(in_h-${h})/2-(${oy.toFixed(4)})*${h}/2`;
  if (sxExpr || syExpr) {
    // Bake animated scale: overscale to peak keyframe, then crop a 1/scale window.
    let peak = Math.max(sx, sy);
    for (const k of clip.keyframes || []) {
      if (typeof k.scaleX === "number") peak = Math.max(peak, clamp(k.scaleX, 0.1, 3));
      if (typeof k.scaleY === "number") peak = Math.max(peak, clamp(k.scaleY, 0.1, 3));
    }
    const over = Math.max(1.25, Math.min(3, Math.ceil(peak * 20) / 20));
    const ow = even(w * over);
    const oh = even(h * over);
    const sxE = sxExpr || sx.toFixed(4);
    const syE = syExpr || sy.toFixed(4);
    // Guard denominators so crop never divides by ~0.
    const sxSafe = `max(0.1\\,(${sxE}))`;
    const sySafe = `max(0.1\\,(${syE}))`;
    parts.push(
      `scale=${ow}:${oh}:force_original_aspect_ratio=increase`,
      `crop=w='min(in_w\\,${w}/(${sxSafe}))':h='min(in_h\\,${h}/(${sySafe}))':x='(in_w-ow)/2-(${oxExpr || ox.toFixed(4)})*${w}/2':y='(in_h-oh)/2-(${oyExpr || oy.toFixed(4)})*${h}/2'`,
      `scale=${w}:${h}`,
      `setsar=1`,
      `fps=${FPS}`,
    );
  } else {
    parts.push(
      `scale=${Math.round(w * sx)}:${Math.round(h * sy)}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}:${cropX}:${cropY}`,
      `setsar=1`,
      `fps=${FPS}`,
    );
  }
  if (rotExpr) {
    parts.push(`rotate='(${rotExpr})*PI/180':c=black:ow=${w}:oh=${h}`);
  } else if (Math.abs(rot) > 0.05) {
    const rad = ((rot * Math.PI) / 180).toFixed(5);
    parts.push(`rotate=${rad}:c=black:ow=${w}:oh=${h}`);
  }
  const briBase = b + lightness * 0.5;
  parts.push(
    `eq=brightness=${briBase.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${s.toFixed(3)}:gamma=${clamp(gamma, 0.1, 3).toFixed(3)}`,
  );
  if (Math.abs(hueShift) > 0.05) {
    parts.push(`hue=h=${hueShift.toFixed(2)}`);
  }
  if (briKf) {
    // Extra animated brightness lift on top of base grade (0..2 → -1..1 offset)
    parts.push(`hue=b='((${briKf})-1)':eval=frame`);
  }
  // Opacity: static transform value, or animated via keyframes (baked with geq + T).
  const opExpr = keyframeExpr(clip.keyframes, "opacity", len, opacity);
  if (opExpr) {
    parts.push(
      `format=gbrp,geq=r='r(X\\,Y)*(${opExpr})':g='g(X\\,Y)*(${opExpr})':b='b(X\\,Y)*(${opExpr})',format=yuv420p`,
    );
  } else if (opacity < 0.999) {
    parts.push(
      `format=gbrp,geq=r='r(X,Y)*${opacity.toFixed(3)}':g='g(X,Y)*${opacity.toFixed(3)}':b='b(X,Y)*${opacity.toFixed(3)}',format=yuv420p`,
    );
  }
  // Temperature (warm/cool) + tint (green/magenta) via colorbalance
  if (Math.abs(temperature) > 1e-3 || Math.abs(tint) > 1e-3) {
    const rm = (temperature * 0.3).toFixed(3);
    const bm = (-temperature * 0.3).toFixed(3);
    const rh = (temperature * 0.2).toFixed(3);
    const bh = (-temperature * 0.2).toFixed(3);
    const gm = (tint * 0.3).toFixed(3);
    parts.push(`colorbalance=rm=${rm}:gm=${gm}:bm=${bm}:rh=${rh}:bh=${bh}`);
  }
  // Highlights / shadows / whites / blacks + master curve + LGG wheels
  const lift = clamp(clip.color.lift ?? 0, -100, 100) / 100;
  const gammaW = clamp(clip.color.gamma ?? 0, -100, 100) / 100;
  const gainW = clamp(clip.color.gain ?? 0, -100, 100) / 100;
  if (
    [highlights, shadows, whites, blacks, curve, lift, gammaW, gainW].some((v) => Math.abs(v) > 1e-3)
  ) {
    const blk = clamp(0 - blacks * 0.15 + lift * 0.2, 0, 0.4);
    const sh = clamp(0.25 + shadows * 0.2 + curve * 0.12 + lift * 0.15, 0.02, 0.6);
    const mid = clamp(0.5 + curve * 0.25 + gammaW * 0.22, 0.15, 0.85);
    const hl = clamp(0.75 + highlights * 0.2 - curve * 0.08 + gainW * 0.15, 0.5, 0.98);
    const wht = clamp(1 + whites * 0.15 + gainW * 0.12, 0.6, 1);
    // ensure strictly increasing control points
    const p1 = blk;
    const p2 = Math.max(p1 + 0.02, sh);
    const pMid = Math.max(p2 + 0.02, mid);
    const p3 = Math.max(pMid + 0.02, hl);
    const p4 = Math.max(p3 + 0.02, wht);
    parts.push(
      `curves=all='0/${p1.toFixed(3)} 0.25/${p2.toFixed(3)} 0.5/${pMid.toFixed(3)} 0.75/${p3.toFixed(3)} 1/${p4.toFixed(3)}'`,
    );
  }
  // Optional .cube LUT (filename relative to project assets/)
  if (clip.color.lut) {
    const lutSafe = path.basename(clip.color.lut);
    // lut3d needs an absolute/relative path; applied later in normalizeClip where cwd is known
    parts.push(`__LUT__${lutSafe}`);
  }
  // Sharpen (unsharp mask) — luma amount scaled by the slider
  if (sharpen > 0) {
    parts.push(`unsharp=5:5:${(sharpen * 1.2).toFixed(3)}:5:5:0`);
  }
  // Vignette — wider angle = stronger darkening at the edges
  if (vignette > 0) {
    const angle = Math.PI / 5 + vignette * (Math.PI / 4);
    parts.push(`vignette=angle=${angle.toFixed(4)}`);
  }
  // Stackable per-clip effects, applied in order
  parts.push(...effectVideoFilters(clip.effects, w, h));
  parts.push(`format=yuv420p`);
  const fi = clamp(clip.fadeIn, 0, len);
  const fo = clamp(clip.fadeOut, 0, len);
  if (fi > 0) parts.push(`fade=t=in:st=0:d=${fi.toFixed(3)}`);
  if (fo > 0) parts.push(`fade=t=out:st=${Math.max(0, len - fo).toFixed(3)}:d=${fo.toFixed(3)}`);
  return parts.join(",");
}

function clipAudioFilter(clip: TimelineClip, len: number): string {
  const vol = clamp(clip.volume, 0, 2);
  const speed = clamp(clip.speed ?? 1, 0.25, 4);
  const parts = [
    `aformat=sample_fmts=fltp:sample_rates=${SAMPLE_RATE}:channel_layouts=stereo`,
  ];
  // Match audio to the retimed video, then apply volume + fades in output time.
  if (Math.abs(speed - 1) > 1e-3) parts.push(...atempoChain(speed));
  const volExpr = keyframeExpr(clip.keyframes, "volume", len, vol);
  if (volExpr) {
    // eval=frame re-evaluates the envelope every audio frame (uses T in seconds).
    parts.push(`volume='${volExpr}':eval=frame`);
  } else {
    parts.push(`volume=${vol.toFixed(3)}`);
  }
  // EQ: bass / treble shelves (dB)
  const bass = clamp(clip.bass ?? 0, -20, 20);
  const treble = clamp(clip.treble ?? 0, -20, 20);
  if (Math.abs(bass) > 0.05) parts.push(`bass=g=${bass.toFixed(2)}`);
  if (Math.abs(treble) > 0.05) parts.push(`treble=g=${treble.toFixed(2)}`);
  // Soft normalize (fast) — optional
  if (clip.normalize) parts.push(`dynaudnorm=f=150:g=12:p=0.9`);
  // Dynamics: compressor / limiter / denoise
  const compress = clamp(clip.compress ?? 0, 0, 1);
  if (compress > 0.02) {
    const ratio = (1 + compress * 7).toFixed(2);
    parts.push(`acompressor=threshold=-18dB:ratio=${ratio}:attack=20:release=250:makeup=2`);
  }
  if (clip.limiter) parts.push(`alimiter=limit=0.95:level=false`);
  const denoise = clamp(clip.denoise ?? 0, 0, 1);
  if (denoise > 0.02) {
    parts.push(`afftdn=nr=${(denoise * 20).toFixed(1)}:nf=${(-25 - denoise * 20).toFixed(1)}`);
  }
  const gate = clamp(clip.gate ?? 0, 0, 1);
  if (gate > 0.02) {
    const thr = (-40 + gate * 28).toFixed(1);
    parts.push(`agate=threshold=${thr}dB:ratio=3:attack=8:release=120:makeup=1`);
  }
  // Stereo balance (-1 = left, +1 = right)
  const bal = clamp(clip.balance ?? 0, -1, 1);
  if (Math.abs(bal) > 0.01) {
    const left = (1 - Math.max(0, bal)).toFixed(3);
    const right = (1 - Math.max(0, -bal)).toFixed(3);
    parts.push(`pan=stereo|c0=${left}*c0|c1=${right}*c1`);
  }
  const fi = clamp(clip.fadeIn, 0, len);
  const fo = clamp(clip.fadeOut, 0, len);
  if (fi > 0) parts.push(`afade=t=in:st=0:d=${fi.toFixed(3)}`);
  if (fo > 0) parts.push(`afade=t=out:st=${Math.max(0, len - fo).toFixed(3)}:d=${fo.toFixed(3)}`);
  return parts.join(",");
}

/** Pass 1 — render one clip into a normalized intermediate (same params for all). */
async function normalizeClip(opts: {
  projectId: string;
  clip: TimelineClip;
  asset: ProjectAsset | null;
  index: number;
  w: number;
  h: number;
}): Promise<{ segPath: string; length: number }> {
  const { projectId, clip, asset, index, w, h } = opts;
  const len = clipLength(clip); // timeline (output) length, after speed
  const sourceSpan = clipSourceLength(clip); // trimmed source length, before speed
  const segPath = path.join(workDir(projectId), `seg-${index}.mp4`);

  const args: string[] = ["-y"];
  let vFilter = clipVideoFilter(clip, w, h, len);
  // Resolve LUT placeholders to real lut3d filters using project asset paths.
  vFilter = vFilter.replace(/__LUT__([^,\[]+)/g, (_m, lutName: string) => {
    const lutPath = path.join(assetsDir(projectId), path.basename(lutName)).replace(/\\/g, "/");
    return `lut3d='${lutPath.replace(/:/g, "\\:")}'`;
  });

  // Adjustment layer: mid-gray grade bed (soft-light blended over program later).
  if (clip.adjustment || !asset) {
    args.push(
      "-f",
      "lavfi",
      "-t",
      len.toFixed(3),
      "-i",
      `color=c=#808080:s=${w}x${h}:r=${FPS}`,
      "-f",
      "lavfi",
      "-t",
      len.toFixed(3),
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}`,
      "-filter_complex",
      `[0:v]${vFilter},format=yuva420p,colorchannelmixer=aa=0.72[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
    );
  } else {
  const srcPath = path.join(assetsDir(projectId), asset.filename);

  if (asset.kind === "image") {
    args.push(
      "-loop",
      "1",
      "-t",
      len.toFixed(3),
      "-i",
      srcPath,
      "-f",
      "lavfi",
      "-t",
      len.toFixed(3),
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}`,
      "-filter_complex",
      `[0:v]${vFilter}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
    );
  } else {
    // video (with or without usable audio) — trim the SOURCE span; speed
    // filters retime it to `len` on output.
    args.push(
      "-ss",
      clip.inPoint.toFixed(3),
      "-t",
      sourceSpan.toFixed(3),
      "-i",
      srcPath,
    );
    if (asset.hasAudio) {
      const aFilter = clipAudioFilter(clip, len);
      args.push(
        "-filter_complex",
        `[0:v]${vFilter}[v];[0:a]${aFilter}[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
      );
    } else {
      args.push(
        "-f",
        "lavfi",
        "-t",
        len.toFixed(3),
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}`,
        "-filter_complex",
        `[0:v]${vFilter}[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a",
      );
    }
  }
  } // end non-adjustment

  args.push(
    "-r",
    String(FPS),
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-video_track_timescale",
    "30000",
    segPath,
  );

  await runCommand(ffmpegPath(), args);
  return { segPath, length: len };
}

/**
 * Pass 2 — combine normalized intermediates with per-boundary transitions.
 * Uses concat for "none" boundaries and xfade/acrossfade for real transitions,
 * chained in a single filter graph. Video & audio lengths stay in lock-step.
 */
function buildCombineGraph(
  clips: TimelineClip[],
  lengths: number[],
): { filter: string; vLabel: string; aLabel: string; duration: number } {
  const parts: string[] = [];
  let vCur = "0:v";
  let aCur = "0:a";
  let total = lengths[0];

  for (let i = 1; i < clips.length; i++) {
    const prevTransition = clips[i - 1].transition;
    const td = clamp(clips[i - 1].transitionDuration, 0.1, 2);
    const vOut = `v${i}`;
    const aOut = `a${i}`;

    if (prevTransition === "none") {
      parts.push(`[${vCur}][${i}:v]concat=n=2:v=1:a=0[${vOut}]`);
      parts.push(`[${aCur}][${i}:a]concat=n=2:v=0:a=1[${aOut}]`);
      total = total + lengths[i];
    } else {
      const dur = Math.min(td, lengths[i] - 0.05, total - 0.05);
      const safeDur = dur > 0 ? dur : 0.1;
      const offset = Math.max(0, total - safeDur);
      parts.push(
        `[${vCur}][${i}:v]xfade=transition=${xfadeName(prevTransition)}:duration=${safeDur.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}]`,
      );
      parts.push(
        `[${aCur}][${i}:a]acrossfade=d=${safeDur.toFixed(3)}[${aOut}]`,
      );
      total = total + lengths[i] - safeDur;
    }
    vCur = vOut;
    aCur = aOut;
  }

  return { filter: parts.join(";"), vLabel: vCur, aLabel: aCur, duration: total };
}

// ---------------- Text overlays (burned via libass) ----------------

function hexToAssColor(hex: string, alpha01 = 1): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  const rgb = m ? m[1] : "FFFFFF";
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = Math.round((1 - clamp(alpha01, 0, 1)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
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

function applyTextCase(text: string, transform?: string): string {
  if (transform === "upper") return text.toUpperCase();
  if (transform === "lower") return text.toLowerCase();
  return text;
}

/**
 * Build an ASS subtitle file that renders the text overlays with per-overlay
 * styling (font, stroke, shadow, background box, opacity, spacing) + animation.
 * Each overlay gets its own [V4+ Style] so BorderStyle can vary per text.
 */
function fontDisplayName(t: TextOverlay): string {
  if (t.fontFile) {
    const base = path.basename(t.fontFile).replace(/\.[^.]+$/, "");
    return (t.font || base || "Arial").trim();
  }
  return (t.font || "Arial Black").trim();
}

function buildTextAss(texts: TextOverlay[], w: number, h: number): string {
  const header = [
    "[Script Info]",
    "Title: Clippers Studio Text",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ];

  const anchor = (align: string) => (align === "left" ? 4 : align === "right" ? 6 : 5);
  const styleLines: string[] = [];
  const eventLines: string[] = [];

  texts.forEach((t, i) => {
    // SVG/PNG stickers are burned as image overlays in finalizePass.
    if (t.stickerUrl && !t.stickerLottie) return;
    const plain = (t.runs?.map((r) => r.text).join("") || t.text || "").trim();
    if (!plain) return;
    const styleName = `T${i}`;
    const start = Math.max(0, t.start);
    const end = start + Math.max(0.1, t.duration);
    const px = Math.round(clamp(t.x, 0, 1) * w);
    const py = Math.round(clamp(t.y, 0, 1) * h);
    const size = Math.round(clamp(t.size, 0.02, 0.4) * w);
    const opacity = t.opacity ?? 1;
    const primary = hexToAssColor(t.color, opacity);
    const bold = t.bold ? -1 : 0;
    const italic = t.italic ? -1 : 0;
    const underline = t.underline ? -1 : 0;
    const an = anchor(t.align);
    const spacing = Math.round(
      clamp((t.letterSpacing ?? 0) + (t.kerning ?? 0), 0, 80),
    );
    const font = fontDisplayName(t);
    const shadow = Math.round(clamp(t.shadow ?? 0, 0, 20));
    const shadowCol = hexToAssColor(t.shadowColor || "#000000", 0.5);

    let borderStyle = 1;
    let outline = Math.round(clamp(t.stroke ?? 0, 0, 20));
    let outlineCol = hexToAssColor(t.strokeColor || "#000000", opacity);
    if (t.bg) {
      // Opaque box: the box is filled with the OutlineColour; Outline = padding.
      borderStyle = 3;
      outline = 8;
      outlineCol = hexToAssColor(t.bgColor || "#000000", t.bgOpacity ?? 0.6);
    }

    styleLines.push(
      `Style: ${styleName},${font},${size},${primary},&H000000FF,${outlineCol},${shadowCol},${bold},${italic},${underline},0,100,${Math.round(clamp(t.lineHeight ?? 1.1, 0.6, 2.2) * 100)},${spacing},0,${borderStyle},${outline},${shadow},${an},10,10,10,1`,
    );

    const tags: string[] = [];
    if (t.anim === "slide") {
      const dy = Math.round(h * 0.06);
      tags.push(`\\move(${px},${py + dy},${px},${py},0,350)`);
      tags.push(`\\fad(250,250)`);
    } else if (t.anim === "pop") {
      // Scale-up feel via brief move from center + fade
      tags.push(`\\move(${px},${py},${px},${py},0,200)`);
      tags.push(`\\fscx120\\fscy120\\t(0,220,\\fscx100\\fscy100)`);
      tags.push(`\\fad(120,200)`);
    } else if (t.anim === "zoom") {
      tags.push(`\\pos(${px},${py})`);
      tags.push(`\\fscx70\\fscy70\\t(0,400,\\fscx100\\fscy100)`);
      tags.push(`\\fad(200,250)`);
    } else {
      tags.push(`\\pos(${px},${py})`);
      if (t.anim === "fade") tags.push(`\\fad(300,300)`);
    }

    // Rich runs → inline ASS override tags; curve → per-glyph arc (pos + frz).
    const curve = clamp(t.curve ?? 0, -100, 100);
    let body = "";
    if (t.runs?.length && Math.abs(curve) <= 1) {
      body = t.runs
        .map((r) => {
          const parts: string[] = [];
          if (r.bold) parts.push("\\b1");
          else parts.push("\\b0");
          if (r.italic) parts.push("\\i1");
          if (r.underline) parts.push("\\u1");
          if (r.color) parts.push(`\\c${hexToAssColor(r.color, opacity)}`);
          const chunk = escapeAss(applyTextCase(r.text, t.transform));
          return `{${parts.join("")}}${chunk}`;
        })
        .join("");
      eventLines.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},${styleName},,0,0,0,,{${tags.join("")}}${body}`,
      );
    } else if (Math.abs(curve) > 1) {
      const plainText = applyTextCase(
        t.runs?.map((r) => r.text).join("") || t.text,
        t.transform,
      );
      const chars = [...plainText];
      const n = Math.max(1, chars.length - 1);
      const amp = Math.abs(curve) * 0.55;
      const sign = curve >= 0 ? 1 : -1;
      chars.forEach((ch, ci) => {
        const u = n === 0 ? 0 : ci / n - 0.5;
        const ang = u * curve * 0.85;
        const rad = (ang * Math.PI) / 180;
        const dx = Math.round(Math.sin(rad) * amp * 1.2);
        const dy = Math.round((1 - Math.cos(rad)) * amp * sign);
        const frz = (-ang).toFixed(1);
        eventLines.push(
          `Dialogue: 0,${assTime(start)},${assTime(end)},${styleName},,0,0,0,,{\\pos(${px + dx},${py + dy})\\frz${frz}\\fad(200,200)}${escapeAss(ch)}`,
        );
      });
    } else {
      body = escapeAss(applyTextCase(t.text, t.transform));
      eventLines.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},${styleName},,0,0,0,,{${tags.join("")}}${body}`,
      );
    }
  });

  return [
    ...header,
    ...styleLines,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...eventLines,
  ].join("\n");
}

/**
 * Resolve a sticker URL (public/ or project asset) to a PNG on disk via sharp.
 */
async function rasterizeStickerToPng(stickerUrl: string, outPng: string): Promise<boolean> {
  try {
    const rel = stickerUrl.replace(/^\//, "").replace(/^api\/editor\/project\/[^/]+\/asset\//, "");
    const publicPath = path.join(process.cwd(), "public", rel);
    const candidates = [publicPath, path.join(process.cwd(), rel)];
    let src: string | null = null;
    for (const c of candidates) {
      try {
        await fs.access(c);
        src = c;
        break;
      } catch {
        // try next
      }
    }
    if (!src) return false;
    if (src.toLowerCase().endsWith(".json")) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharpMod = require("sharp");
    const sharp = (sharpMod.default || sharpMod) as (input: string) => {
      resize: (
        w: number,
        h: number,
        opts: { fit: string; background: { r: number; g: number; b: number; alpha: number } },
      ) => { png: () => { toFile: (p: string) => Promise<unknown> } };
    };
    await sharp(src)
      .resize(512, 512, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPng);
    return true;
  } catch {
    return false;
  }
}

/**
 * Final pass — burn text overlays, SVG/PNG stickers, and/or lay positioned
 * music tracks over the combined base video.
 */
async function finalizePass(opts: {
  projectId: string;
  basePath: string;
  outPath: string;
  duration: number;
  /** One or more music/SFX lanes to mix under the dialogue track. */
  musicLanes?: Array<{ track: MusicTrack; filename: string }>;
  texts?: TextOverlay[];
  /** Optional pre-built karaoke ASS content (Phase 4). */
  karaokeAss?: string | null;
  w: number;
  h: number;
  signal?: AbortSignal;
}) {
  const {
    projectId,
    basePath,
    outPath,
    duration,
    musicLanes,
    texts,
    karaokeAss,
    w,
    h,
    signal,
  } = opts;
  const dir = workDir(projectId);
  const allTexts = texts || [];
  const stickerTexts = allTexts.filter((t) => t.stickerUrl && !t.stickerLottie);
  const assTexts = allTexts.filter((t) => !(t.stickerUrl && !t.stickerLottie));
  const hasAss = assTexts.some((t) => textHasContent(t));
  const hasKaraoke = Boolean(karaokeAss?.trim());
  const lanes = (musicLanes || []).filter((l) => l.filename);
  const hasMusic = lanes.length > 0;

  const inputs: string[] = ["-i", basePath];
  const vParts: string[] = [];
  const aParts: string[] = [];
  const tempPngs: string[] = [];
  const stickerLayers: Array<{ inputIdx: number; t: TextOverlay }> = [];

  for (const t of stickerTexts) {
    const png = path.join(dir, `stk-${t.id}.png`);
    const ok = await rasterizeStickerToPng(t.stickerUrl!, png);
    if (!ok) continue;
    tempPngs.push(png);
    inputs.push("-i", png);
    stickerLayers.push({ inputIdx: stickerLayers.length + 1, t });
  }

  // ----- video: stickers then optional ASS text -----
  let vCur = "[0:v]";
  let vMap = "0:v";
  stickerLayers.forEach((layer, i) => {
    const t = layer.t;
    const start = Math.max(0, t.start);
    const end = start + Math.max(0.1, t.duration);
    const sw = Math.round(clamp(t.size, 0.04, 0.5) * w);
    const x = Math.round(clamp(t.x, 0, 1) * w - sw / 2);
    const y = Math.round(clamp(t.y, 0, 1) * h - sw / 2);
    const scaled = `[stk${i}]`;
    const next = `[stkv${i}]`;
    vParts.push(
      `[${layer.inputIdx}:v]scale=${sw}:-1:flags=lanczos,format=rgba${scaled}`,
    );
    vParts.push(
      `${vCur}${scaled}overlay=x=${x}:y=${y}:format=auto:enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'${next}`,
    );
    vCur = next;
    vMap = next;
  });

  let assName: string | null = null;
  let karaokeName: string | null = null;
  if (hasKaraoke) {
    karaokeName = `karaoke-${Date.now()}.ass`;
    await fs.writeFile(path.join(dir, karaokeName), `\ufeff${karaokeAss}`, "utf8");
    const next = "[vkara]";
    vParts.push(`${vCur}ass=${karaokeName}${next}`);
    vCur = next;
    vMap = next;
  }
  if (hasAss) {
    assName = `text-${Date.now()}.ass`;
    await fs.writeFile(path.join(dir, assName), `\ufeff${buildTextAss(assTexts, w, h)}`, "utf8");
    const needsFonts = assTexts.some((t) => t.fontFile);
    const fontsOpt = needsFonts
      ? `:fontsdir='${assetsDir(projectId).replace(/\\/g, "/").replace(/:/g, "\\:")}'`
      : "";
    const next = "[vout]";
    vParts.push(`${vCur}ass=${assName}${fontsOpt}${next}`);
    vCur = next;
    vMap = next;
  }

  // ----- audio: optional positioned music mix (N lanes) -----
  let aMap = "0:a";
  if (hasMusic) {
    const musLabels: string[] = [];
    const musicBaseIdx = 1 + stickerLayers.length;
    lanes.forEach((lane, i) => {
      const inputIdx = musicBaseIdx + i;
      inputs.push("-i", path.join(assetsDir(projectId), lane.filename));
      const music = lane.track;
      const vol = clamp(music.volume, 0, 2);
      const duck = clamp(music.duck ?? 0, 0, 1);
      const inP = Math.max(0, music.inPoint ?? 0);
      const outP = Math.max(inP + 0.1, music.outPoint ?? duration);
      const start = clamp(music.start ?? 0, 0, Math.max(0, duration));
      const span = Math.min(outP - inP, Math.max(0.1, duration - start));
      const fi = clamp(music.fadeIn, 0, span);
      const fo = clamp(music.fadeOut, 0, span);
      const label = `mus${i}`;
      const bedVol = vol * (1 - duck * 0.25);
      const chain = [
        `[${inputIdx}:a]atrim=${inP.toFixed(3)}:${(inP + span).toFixed(3)}`,
        `asetpts=PTS-STARTPTS`,
        `volume=${bedVol.toFixed(3)}`,
      ];
      if (fi > 0) chain.push(`afade=t=in:st=0:d=${fi.toFixed(3)}`);
      if (fo > 0) chain.push(`afade=t=out:st=${Math.max(0, span - fo).toFixed(3)}:d=${fo.toFixed(3)}`);
      if (start > 0) chain.push(`adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}`);
      aParts.push(`${chain.join(",")}[${label}]`);
      musLabels.push(`[${label}]`);
    });
    const maxDuck = Math.max(0, ...lanes.map((l) => l.track.duck ?? 0));
    if (maxDuck > 0.02) {
      const ratio = (2 + maxDuck * 6).toFixed(1);
      aParts.push(
        `[0:a]asplit=2[adial][abase]`,
        `${musLabels.join("")}amix=inputs=${musLabels.length}:duration=longest:dropout_transition=0:normalize=0[musmix]`,
        `[musmix][adial]sidechaincompress=threshold=0.04:ratio=${ratio}:attack=40:release=400:makeup=1[mduck]`,
        `[abase][mduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
      );
    } else {
      const n = 1 + musLabels.length;
      aParts.push(
        `[0:a]${musLabels.join("")}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0[aout]`,
      );
    }
    aMap = "[aout]";
  }

  const needsVideoEncode = hasAss || stickerLayers.length > 0;
  const filter = [...vParts, ...aParts].join(";");
  const args = ["-y", ...inputs];
  if (filter) args.push("-filter_complex", filter);
  args.push("-map", vMap, "-map", aMap);
  if (needsVideoEncode) {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
  args.push("-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", duration.toFixed(3), outPath);

  try {
    await runCommand(ffmpegPath(), args, { cwd: dir, signal });
  } finally {
    if (assName) {
      try {
        await fs.unlink(path.join(dir, assName));
      } catch {
        // ignore
      }
    }
    if (karaokeName) {
      try {
        await fs.unlink(path.join(dir, karaokeName));
      } catch {
        // ignore
      }
    }
    for (const p of tempPngs) {
      try {
        await fs.unlink(p);
      } catch {
        // ignore
      }
    }
  }
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Normalize + clamp export options coming from the client. */
function resolveExport(o?: Partial<ExportOptions>): ExportOptions {
  const format =
    o?.format === "webm" || o?.format === "gif" || o?.format === "mov" ? o.format : "mp4";
  const allowedRes = [720, 1080, 1440, 2160, 4320];
  const resolution = allowedRes.includes(Number(o?.resolution)) ? Number(o!.resolution) : 1080;
  const allowedFps = [24, 30, 60];
  const fps = allowedFps.includes(Number(o?.fps)) ? Number(o!.fps) : 30;
  const quality = o?.quality === "low" || o?.quality === "medium" ? o.quality : "high";
  const hwEncode = o?.hwEncode !== false;
  let codec: ExportCodec = "h264";
  if (format === "gif") {
    codec = "h264";
  } else if (format === "webm") {
    codec = o?.codec === "av1" ? "av1" : "vp9";
  } else if (o?.codec === "hevc" || o?.codec === "av1" || o?.codec === "h264") {
    codec = o.codec;
  }
  return { format, codec, resolution, fps, quality, hwEncode, karaokeCaptions: Boolean(o?.karaokeCaptions) };
}

/** Final transcode: master H.264 mp4 → chosen container / codec / fps / quality. */
async function encodePass(opts: {
  masterPath: string;
  outPath: string;
  options: ExportOptions;
  signal?: AbortSignal;
}) {
  const { masterPath, outPath, options, signal } = opts;
  const args = ["-y", "-i", masterPath];

  if (options.format === "gif") {
    const gfps = Math.min(options.fps, 20);
    args.push(
      "-filter_complex",
      `fps=${gfps},scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
      outPath,
    );
    await runCommand(ffmpegPath(), args, { signal });
    return;
  }

  const codec: ExportCodec =
    options.format === "webm"
      ? options.codec === "av1"
        ? "av1"
        : "vp9"
      : options.codec === "hevc" || options.codec === "av1"
        ? options.codec
        : "h264";

  const preferHw = options.hwEncode !== false && (codec === "h264" || codec === "hevc" || codec === "av1");
  const { args: vArgs } = await videoEncodeArgs({
    codec,
    quality: options.quality,
    preferHw,
  });

  const audioArgs =
    options.format === "webm"
      ? ["-c:a", "libopus", "-b:a", "128k"]
      : ["-c:a", "aac", "-b:a", "192k"];

  args.push("-r", String(options.fps), ...vArgs, ...audioArgs);
  if (options.format === "mov") {
    args.push("-f", "mov");
  } else if (options.format === "mp4") {
    args.push("-movflags", "+faststart");
  } else if (options.format === "webm") {
    args.push("-f", "webm");
  }
  args.push(outPath);
  try {
    await runCommand(ffmpegPath(), args, { signal });
  } catch (err) {
    // HW encode can fail at runtime — retry once with software.
    if (!preferHw) throw err;
    const soft = await videoEncodeArgs({ codec, quality: options.quality, preferHw: false });
    const retry = ["-y", "-i", masterPath, "-r", String(options.fps), ...soft.args, ...audioArgs];
    if (options.format === "mov") retry.push("-f", "mov");
    else if (options.format === "mp4") retry.push("-movflags", "+faststart");
    else if (options.format === "webm") retry.push("-f", "webm");
    retry.push(outPath);
    await runCommand(ffmpegPath(), retry, { signal });
  }
}

/** Solid black + silent audio bed for free-placed timelines. */
async function makeBlankBase(opts: {
  projectId: string;
  outPath: string;
  duration: number;
  w: number;
  h: number;
  signal?: AbortSignal;
}) {
  const dur = Math.max(0.2, opts.duration);
  await runCommand(
    ffmpegPath(),
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${opts.w}x${opts.h}:r=${FPS}:d=${dur.toFixed(3)}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${SAMPLE_RATE}:cl=stereo:d=${dur.toFixed(3)}`,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      opts.outPath,
    ],
    { signal: opts.signal },
  );
}

/**
 * Composite free-placed overlay clips onto a main timeline video.
 * Overlay segments are already normalized; we delay them to tlStart.
 */
async function overlayPass(opts: {
  projectId: string;
  basePath: string;
  outPath: string;
  duration: number;
  overlays: Array<{ clip: TimelineClip; segPath: string; length: number }>;
  signal?: AbortSignal;
}) {
  const { basePath, outPath, duration, overlays, signal } = opts;
  if (!overlays.length) {
    await runCommand(ffmpegPath(), ["-y", "-i", basePath, "-c", "copy", outPath], { signal });
    return;
  }

  const inputs: string[] = ["-i", basePath];
  for (const o of overlays) inputs.push("-i", o.segPath);

  const vParts: string[] = [];
  const aParts: string[] = [];
  let vCur = "[0:v]";
  const aLabels: string[] = ["[0:a]"];

  overlays.forEach((o, i) => {
    const idx = i + 1;
    const start = Math.max(0, o.clip.tlStart ?? 0);
    const end = start + o.length;
    const vOut = `[ovv${i}]`;
    const vNext = `[vx${i}]`;
    const enable = `enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'`;
    vParts.push(
      `[${idx}:v]setpts=PTS-STARTPTS+${start.toFixed(3)}/TB${vOut}`,
    );
    if (o.clip.adjustment) {
      // True grade composite: soft-light blend of the graded mid-gray bed.
      vParts.push(
        `${vCur}${vOut}blend=all_mode=softlight:all_opacity=0.7:${enable}${vNext}`,
      );
    } else {
      vParts.push(
        `${vCur}${vOut}overlay=eof_action=pass:repeatlast=0:${enable}${vNext}`,
      );
    }
    vCur = vNext;

    // Mix overlay audio if the clip still has volume (skip adjustment beds)
    if (!o.clip.adjustment && (o.clip.volume ?? 0) > 0.01) {
      const delayMs = Math.round(start * 1000);
      const aLab = `[ova${i}]`;
      aParts.push(
        `[${idx}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},apad,atrim=0:${duration.toFixed(3)}${aLab}`,
      );
      aLabels.push(aLab);
    }
  });

  let aMap = "0:a";
  if (aLabels.length > 1) {
    aParts.push(
      `${aLabels.join("")}amix=inputs=${aLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`,
    );
    aMap = "[aout]";
  }

  const filter = [...vParts, ...aParts].join(";");
  await runCommand(
    ffmpegPath(),
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      vCur,
      "-map",
      aMap,
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outPath,
    ],
    { signal },
  );
}

export async function renderProject(opts: {
  projectId: string;
  spec: ProjectSpec;
  exportOptions?: Partial<ExportOptions>;
  signal?: AbortSignal;
}): Promise<{ outName: string }> {
  const { projectId, spec, signal } = opts;
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const rawClips = (spec.clips || []).filter((c) => clipLength(c) > 0.1);
  const allClips = flattenCompounds(resolveMulticam(rawClips));
  const mainClips = allClips.filter((c) => clipLane(c) === 0);
  const overlayClips = allClips.filter((c) => clipLane(c) > 0);
  if (!mainClips.length) throw new Error("Add at least one clip on the main video track.");

  const options = resolveExport(opts.exportOptions ?? DEFAULT_EXPORT);
  const preset = ASPECT_PRESETS[spec.aspect] || ASPECT_PRESETS["9:16"];
  // Bake the chosen resolution at pass 1 for best quality (scale the 1080 base).
  const scale = options.resolution / 1080;
  const w = even(preset.w * scale);
  const h = even(preset.h * scale);

  const assetById = new Map(project.assets.map((a) => [a.id, a]));

  // Pass 1: normalize main + overlay clips
  const mainLengths: number[] = [];
  const mainSegs: string[] = [];
  for (let i = 0; i < mainClips.length; i++) {
    if (signal?.aborted) throw new Error("Cancelled");
    const clip = mainClips[i];
    if (clip.adjustment) throw new Error("Adjustment layers belong on an overlay track.");
    const asset = assetById.get(clip.assetId);
    if (!asset) throw new Error("A clip references a missing asset.");
    const { segPath, length } = await normalizeClip({
      projectId,
      clip,
      asset,
      index: i,
      w,
      h,
    });
    mainSegs.push(segPath);
    mainLengths.push(length);
  }

  const overlaySegs: Array<{ clip: TimelineClip; segPath: string; length: number }> = [];
  for (let i = 0; i < overlayClips.length; i++) {
    if (signal?.aborted) throw new Error("Cancelled");
    const clip = overlayClips[i];
    const asset = clip.adjustment ? null : assetById.get(clip.assetId) || null;
    if (!clip.adjustment && !asset) throw new Error("A clip references a missing asset.");
    const { segPath, length } = await normalizeClip({
      projectId,
      clip,
      asset,
      index: 1000 + i,
      w,
      h,
    });
    overlaySegs.push({ clip, segPath, length });
  }

  const ext =
    options.format === "webm"
      ? "webm"
      : options.format === "gif"
        ? "gif"
        : options.format === "mov"
          ? "mov"
          : "mp4";
  const outName = `export-${Date.now()}.${ext}`;
  const outPath = path.join(exportsDir(projectId), outName);
  // The whole pipeline builds an H.264 mp4 master; encodePass makes the final file.
  const masterPath = path.join(workDir(projectId), `master-${Date.now()}.mp4`);

  // Resolve background music lanes + text overlays (if any)
  const musicLanes: Array<{ track: MusicTrack; filename: string }> = [];
  if (spec.music) {
    const a = assetById.get(spec.music.assetId);
    if (a) musicLanes.push({ track: spec.music, filename: a.filename });
  }
  for (const m of spec.musicTracks || []) {
    const a = assetById.get(m.assetId);
    if (a) musicLanes.push({ track: m, filename: a.filename });
  }
  const hasMusic = musicLanes.length > 0;
  const texts = (spec.texts || []).filter((t) => textHasContent(t));
  const hasText = texts.length > 0;
  const hasOverlays = overlaySegs.length > 0;
  const wantKaraoke = Boolean(options.karaokeCaptions);

  // Map Whisper words onto the main timeline for karaoke burn
  let karaokeAss: string | null = null;
  if (wantKaraoke) {
    const words: TranscriptWord[] = [];
    const { starts: tlStarts } = computeTimeline(mainClips, {
      freeMain: Boolean(spec.freeMain),
    });
    for (let i = 0; i < mainClips.length; i++) {
      const clip = mainClips[i];
      const cached = await loadCachedTranscript(projectId, clip.assetId);
      if (!cached?.segments?.length) continue;
      const speed = clip.speed || 1;
      const tl0 = tlStarts[i] ?? 0;
      for (const seg of cached.segments) {
        for (const w of seg.words || []) {
          if (!w.word?.trim()) continue;
          if (w.end <= clip.inPoint || w.start >= clip.outPoint) continue;
          const local = Math.max(0, w.start - clip.inPoint) / speed;
          const localEnd = Math.max(0.05, w.end - clip.inPoint) / speed;
          words.push({
            word: w.word.trim(),
            start: tl0 + local,
            end: tl0 + localEnd,
          });
        }
      }
    }
    if (words.length) {
      karaokeAss = buildTimelineKaraokeAss({
        words,
        title: project.name || "Clip",
        w,
        h,
      });
    }
  }

  const needFinalize = hasMusic || hasText || Boolean(karaokeAss);
  const combinedPath = path.join(workDir(projectId), `combined-${Date.now()}.mp4`);
  const afterOverlayPath = hasOverlays
    ? path.join(workDir(projectId), `overlaid-${Date.now()}.mp4`)
    : combinedPath;
  // When finalizing we render video to a temp base first, then burn text / mix music.
  const basePath = needFinalize
    ? path.join(workDir(projectId), `base-${Date.now()}.mp4`)
    : masterPath;

  const freeMain =
    Boolean(spec.freeMain) ||
    mainClips.some((c) => typeof c.tlStart === "number" && Number.isFinite(c.tlStart));

  let finalDuration = mainLengths.reduce((a, b) => a + b, 0);

  if (freeMain) {
    // Free-place V1: lay clips onto a blank bed at each tlStart (gaps/overlaps OK).
    finalDuration = 0;
    const mainLaid: Array<{ clip: TimelineClip; segPath: string; length: number }> = [];
    for (let i = 0; i < mainClips.length; i++) {
      const clip = mainClips[i];
      const length = mainLengths[i];
      const start = Math.max(0, clip.tlStart ?? 0);
      finalDuration = Math.max(finalDuration, start + length);
      mainLaid.push({
        clip: { ...clip, tlStart: start },
        segPath: mainSegs[i],
        length,
      });
    }
    for (const o of overlaySegs) {
      finalDuration = Math.max(
        finalDuration,
        Math.max(0, o.clip.tlStart ?? 0) + o.length,
      );
    }
    finalDuration = Math.max(0.2, finalDuration);
    const blankPath = path.join(workDir(projectId), `blank-${Date.now()}.mp4`);
    await makeBlankBase({
      projectId,
      outPath: blankPath,
      duration: finalDuration,
      w,
      h,
      signal,
    });
    await overlayPass({
      projectId,
      basePath: blankPath,
      outPath: combinedPath,
      duration: finalDuration,
      overlays: mainLaid,
      signal,
    });
    try {
      await fs.unlink(blankPath);
    } catch {
      // ignore
    }
  } else if (mainSegs.length === 1) {
    await runCommand(ffmpegPath(), ["-y", "-i", mainSegs[0], "-c", "copy", combinedPath], {
      signal,
    });
    finalDuration = mainLengths[0] ?? 0;
  } else {
    const inputs: string[] = [];
    for (const p of mainSegs) inputs.push("-i", p);
    const { filter, vLabel, aLabel, duration } = buildCombineGraph(mainClips, mainLengths);
    finalDuration = duration;

    await runCommand(
      ffmpegPath(),
      [
        "-y",
        ...inputs,
        "-filter_complex",
        filter,
        "-map",
        `[${vLabel}]`,
        "-map",
        `[${aLabel}]`,
        "-r",
        String(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        combinedPath,
      ],
      { signal },
    );
  }

  // Extend duration if overlays hang past the main track
  for (const o of overlaySegs) {
    const end = Math.max(0, o.clip.tlStart ?? 0) + o.length;
    if (end > finalDuration) finalDuration = end;
  }

  if (hasOverlays) {
    await overlayPass({
      projectId,
      basePath: combinedPath,
      outPath: afterOverlayPath,
      duration: finalDuration,
      overlays: overlaySegs,
      signal,
    });
    try {
      await fs.unlink(combinedPath);
    } catch {
      // ignore
    }
  }

  // Copy overlaid/combined into basePath or masterPath
  const videoReady = afterOverlayPath;
  if (needFinalize) {
    if (videoReady !== basePath) {
      await runCommand(ffmpegPath(), ["-y", "-i", videoReady, "-c", "copy", basePath], {
        signal,
      });
      if (hasOverlays) {
        try {
          await fs.unlink(videoReady);
        } catch {
          // ignore
        }
      }
    }
    await finalizePass({
      projectId,
      basePath,
      outPath: masterPath,
      duration: finalDuration,
      musicLanes: hasMusic ? musicLanes : undefined,
      texts: hasText ? texts : undefined,
      karaokeAss,
      w,
      h,
      signal,
    });
    try {
      await fs.unlink(basePath);
    } catch {
      // ignore
    }
  } else if (videoReady !== masterPath) {
    await runCommand(ffmpegPath(), ["-y", "-i", videoReady, "-c", "copy", masterPath], {
      signal,
    });
    if (hasOverlays || mainSegs.length >= 1) {
      try {
        await fs.unlink(videoReady);
      } catch {
        // ignore
      }
    }
  }

  // Pass 4: encode the master into the requested format / fps / quality
  await encodePass({ masterPath, outPath, options, signal });
  try {
    await fs.unlink(masterPath);
  } catch {
    // ignore
  }

  // best-effort cleanup of intermediates
  for (const p of [...mainSegs, ...overlaySegs.map((o) => o.segPath)]) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore
    }
  }

  return { outName };
}
