import type { AspectRatio, Job } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import type { ClipStudioControlValues } from "@/components/clip-studio/ClipStudioControls";

export const JOB_STEPS = [
  { key: "downloading", label: "Pull" },
  { key: "transcribing", label: "Speech" },
  { key: "analyzing", label: "Moments" },
  { key: "rendering", label: "Export" },
] as const;

export type JobHistoryItem = {
  id: string;
  title?: string;
  url: string;
  status: Job["status"];
  progress: number;
  message: string;
  createdAt: string;
  clipCount: number;
  aspectRatio: AspectRatio;
};

export function statusIndex(status: Job["status"]) {
  const order = ["queued", "downloading", "transcribing", "analyzing", "rendering", "done"];
  return Math.max(0, order.indexOf(status));
}

export function previewAspect(ratio: AspectRatio) {
  const { w, h } = ASPECT_PRESETS[ratio];
  return `${w} / ${h}`;
}

export function formatMsShort(ms: number) {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.max(1, Math.round(sec / 60));
  return `${min}m`;
}

/** Friendly banners for common download / encode failures. */
export function friendlyJobError(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t.includes("cookie") || t.includes("login") || t.includes("sign in")) {
    return "Instagram / TikTok may need cookies. Add tools/cookies.txt (Netscape format from a browser export), then retry.";
  }
  if (t.includes("unsupported url") || t.includes("invalid url") || t.includes("no video")) {
    return "That link doesn’t look downloadable. Use a full YouTube, TikTok, or Instagram URL (not a shortened redirect).";
  }
  if (t.includes("sample rate") || t.includes("samplerate") || t.includes("48000") || t.includes("44100")) {
    return "Audio format mismatch while encoding. Try Reliable encode, or re-upload the file.";
  }
  if (
    t.includes("ffmpeg") ||
    t.includes("ffprobe") ||
    (t.includes("enoent") && (t.includes("ffmpeg") || t.includes("ffprobe"))) ||
    (t.includes("spawn") && (t.includes("ffmpeg") || t.includes("ffprobe")))
  ) {
    return "The video engine wasn’t found or failed to start. Run npm run setup:tools, then restart.";
  }
  if (t.includes("sharp") || t.includes("libvips") || t.includes("could not load the \"sharp\"")) {
    return "Image engine Sharp failed to load. Run npm install sharp (or npm rebuild sharp) and restart.";
  }
  if (t.includes("private") || t.includes("403") || t.includes("401")) {
    return "This video is private or blocked. Try another link, or add cookies for the account that can view it.";
  }
  return raw;
}

export function appendJobParams(form: FormData, params: ClipStudioControlValues) {
  form.append("aspectRatio", params.aspectRatio);
  form.append("layoutMode", params.layoutMode);
  form.append("captionsEnabled", params.captionsEnabled ? "true" : "false");
  form.append("whisperQuality", params.whisperQuality);
  form.append("captionTheme", params.captionTheme);
  form.append("captionReadMode", params.captionReadMode);
  form.append("captionEmojis", params.captionEmojis ? "true" : "false");
  form.append("exportQuality", params.exportQuality);
  form.append("exportCodec", params.exportCodec);
  form.append("preferHwEncode", params.preferHwEncode ? "true" : "false");
  form.append("clipCount", String(params.clipCount));
  form.append("manualStartTime", params.manualStartTime);
  form.append("manualEndTime", params.manualEndTime);
  form.append("captionPrimary", params.captionPrimary);
  form.append("captionHighlight", params.captionHighlight);
  form.append("captionFont", params.captionFont);
  form.append("captionAlign", params.captionAlign);
  form.append("captionFontSize", String(params.captionFontSize));
  form.append("captionOutline", String(params.captionOutline));
  form.append("captionBox", params.captionBox ? "true" : "false");
  form.append("removeWatermark", params.removeWatermark ? "true" : "false");
  form.append("clipMode", params.clipMode);
  form.append("stripBurnIn", params.stripBurnIn ? "true" : "false");
}
