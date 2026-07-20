import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { parseCaptionsEnabled } from "@/lib/captions-flag";
import { runPipeline } from "@/lib/pipeline";
import type { AspectRatio, LayoutMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];
const LAYOUTS: LayoutMode[] = ["auto", "fill", "face-top"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      aspectRatio?: string;
      layoutMode?: string;
      captionsEnabled?: unknown;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Paste a video link first." }, { status: 400 });
    }

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("bad protocol");
      }
    } catch {
      return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    }

    const aspectRatio = ASPECTS.includes(body.aspectRatio as AspectRatio)
      ? (body.aspectRatio as AspectRatio)
      : "9:16";
    const layoutMode = LAYOUTS.includes(body.layoutMode as LayoutMode)
      ? (body.layoutMode as LayoutMode)
      : "auto";
    const captionsEnabled = parseCaptionsEnabled(body.captionsEnabled, true);

    const job = await createJob(url, {
      aspectRatio,
      layoutMode,
      captionsEnabled,
    });
    void runPipeline(job.id, url);

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
