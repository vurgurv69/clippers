import { ffmpegPath, runCommand } from "./binaries";
import type { ExportCodec, ExportQuality } from "./editor-types";

export type HwEncoder =
  | "none"
  | "h264_nvenc"
  | "h264_qsv"
  | "h264_amf"
  | "h264_videotoolbox"
  | "hevc_nvenc"
  | "hevc_qsv"
  | "hevc_amf"
  | "hevc_videotoolbox"
  | "av1_nvenc"
  | "av1_qsv"
  | "av1_amf";

const cacheByCodec: Partial<Record<ExportCodec, HwEncoder>> = {};
const probingByCodec: Partial<Record<ExportCodec, Promise<HwEncoder>>> = {};

const HW_ORDER: Record<"h264" | "hevc" | "av1", HwEncoder[]> = {
  h264: ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"],
  hevc: ["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_videotoolbox"],
  av1: ["av1_nvenc", "av1_qsv", "av1_amf"],
};

/** Detect the best available hardware encoder for a codec (cached). */
export async function detectHwEncoder(codec: ExportCodec = "h264"): Promise<HwEncoder> {
  if (codec === "vp9") return "none";
  if (cacheByCodec[codec]) return cacheByCodec[codec]!;
  if (probingByCodec[codec]) return probingByCodec[codec]!;
  probingByCodec[codec] = (async () => {
    try {
      const { stdout, stderr } = await runCommand(ffmpegPath(), ["-hide_banner", "-encoders"]);
      const text = `${stdout}\n${stderr}`;
      const order = HW_ORDER[codec as "h264" | "hevc" | "av1"] || HW_ORDER.h264;
      for (const name of order) {
        if (text.includes(name)) {
          const ok = await smokeTestEncoder(name);
          if (ok) {
            cacheByCodec[codec] = name;
            return name;
          }
        }
      }
    } catch {
      // fall through
    }
    cacheByCodec[codec] = "none";
    return "none";
  })();
  return probingByCodec[codec]!;
}

async function smokeTestEncoder(name: HwEncoder): Promise<boolean> {
  if (name === "none") return false;
  try {
    await runCommand(ffmpegPath(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=0.04",
      "-frames:v",
      "1",
      "-c:v",
      name,
      ...hwExtraArgs(name, "medium"),
      "-f",
      "null",
      "-",
    ]);
    return true;
  } catch {
    return false;
  }
}

function hwExtraArgs(encoder: HwEncoder, quality: ExportQuality): string[] {
  if (encoder.endsWith("_nvenc")) {
    const cq = quality === "high" ? "19" : quality === "medium" ? "23" : "28";
    return ["-preset", "p4", "-rc", "vbr", "-cq", cq, "-b:v", "0"];
  }
  if (encoder.endsWith("_qsv")) {
    const q = quality === "high" ? "19" : quality === "medium" ? "23" : "28";
    return ["-global_quality", q, "-look_ahead", "1"];
  }
  if (encoder.endsWith("_amf")) {
    const q = quality === "high" ? "18" : quality === "medium" ? "22" : "28";
    return ["-quality", "balanced", "-rc", "cqp", "-qp_i", q, "-qp_p", q];
  }
  if (encoder.endsWith("_videotoolbox")) {
    const br = quality === "high" ? "8M" : quality === "medium" ? "5M" : "3M";
    return ["-b:v", br, "-allow_sw", "1"];
  }
  return [];
}

function softEncodeArgs(codec: ExportCodec, quality: ExportQuality): { encoder: string; args: string[] } {
  if (codec === "hevc") {
    const crf = quality === "high" ? 20 : quality === "medium" ? 24 : 28;
    return {
      encoder: "libx265",
      args: ["-c:v", "libx265", "-preset", "fast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-tag:v", "hvc1"],
    };
  }
  if (codec === "av1") {
    const crf = quality === "high" ? 28 : quality === "medium" ? 34 : 40;
    return {
      encoder: "libaom-av1",
      args: [
        "-c:v",
        "libaom-av1",
        "-crf",
        String(crf),
        "-b:v",
        "0",
        "-cpu-used",
        "6",
        "-row-mt",
        "1",
        "-pix_fmt",
        "yuv420p",
      ],
    };
  }
  if (codec === "vp9") {
    const crf = quality === "high" ? 24 : quality === "medium" ? 31 : 37;
    return {
      encoder: "libvpx-vp9",
      args: [
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        String(crf),
        "-row-mt",
        "1",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-pix_fmt",
        "yuv420p",
      ],
    };
  }
  const crf = quality === "high" ? 18 : quality === "medium" ? 21 : 25;
  return {
    encoder: "libx264",
    args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p"],
  };
}

/** Build ffmpeg video codec args (HW or software) for the chosen codec. */
export async function videoEncodeArgs(opts: {
  codec: ExportCodec;
  quality: ExportQuality;
  preferHw: boolean;
}): Promise<{ args: string[]; encoder: string }> {
  const codec = opts.codec === "vp9" ? "vp9" : opts.codec;
  if (opts.preferHw && codec !== "vp9") {
    const hw = await detectHwEncoder(codec);
    if (hw !== "none") {
      return {
        encoder: hw,
        args: ["-c:v", hw, ...hwExtraArgs(hw, opts.quality), "-pix_fmt", "yuv420p"],
      };
    }
  }
  return softEncodeArgs(codec, opts.quality);
}

/** @deprecated Prefer videoEncodeArgs — kept for H.264 callers. */
export async function h264EncodeArgs(opts: {
  quality: ExportQuality;
  preferHw: boolean;
}): Promise<{ args: string[]; encoder: string }> {
  return videoEncodeArgs({ codec: "h264", quality: opts.quality, preferHw: opts.preferHw });
}

export function hwEncoderLabel(name: string): string {
  switch (name) {
    case "h264_nvenc":
    case "hevc_nvenc":
    case "av1_nvenc":
      return "NVIDIA NVENC";
    case "h264_qsv":
    case "hevc_qsv":
    case "av1_qsv":
      return "Intel Quick Sync";
    case "h264_amf":
    case "hevc_amf":
    case "av1_amf":
      return "AMD AMF";
    case "h264_videotoolbox":
    case "hevc_videotoolbox":
      return "Apple VideoToolbox";
    case "libx265":
      return "CPU (libx265)";
    case "libaom-av1":
      return "CPU (libaom-av1)";
    case "libvpx-vp9":
      return "CPU (libvpx-vp9)";
    default:
      return "CPU (libx264)";
  }
}
