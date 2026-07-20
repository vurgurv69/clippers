import { NextResponse } from "next/server";
import { detectHwEncoder, hwEncoderLabel } from "@/lib/hw-encode";
import type { ExportCodec } from "@/lib/editor-types";

export const runtime = "nodejs";

/** Report which hardware encoder (if any) is available for a codec. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("codec") || "h264").toLowerCase();
  const codec: ExportCodec =
    raw === "hevc" || raw === "av1" || raw === "vp9" || raw === "h264" ? raw : "h264";
  const encoder = await detectHwEncoder(codec);
  return NextResponse.json({
    encoder,
    codec,
    label: hwEncoderLabel(encoder),
    available: encoder !== "none",
  });
}
