import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import {
  analyzeHeuristics,
  cleanupSuggestions,
  refineSuggestionsWithLlm,
  type AnalyzeInput,
} from "@/lib/ai-analyze";
import {
  assetMediaPath,
  detectActiveRanges,
  loadCachedTranscript,
  saveCachedTranscript,
} from "@/lib/media-activity";
import { transcribeVideo } from "@/lib/transcribe";
import type { TranscriptSegment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  projectId?: string;
  assetIds?: string[];
  duration?: number;
  videoTitle?: string;
  transcriptText?: string;
  segments?: TranscriptSegment[];
  hasCaptions?: boolean;
  hasMusic?: boolean;
  clipCount?: number;
  /** When true, run Whisper if no cached transcript (slow first run). */
  transcribe?: boolean;
};

/**
 * POST /api/ai/analyze — heuristic markers + scorecard;
 * reuses cached Whisper transcript; ffmpeg silence/energy; optional LLM labels.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    let duration = Number(body.duration) || 0;
    let videoTitle = body.videoTitle || "Clip";
    let hasCaptions = Boolean(body.hasCaptions);
    let hasMusic = Boolean(body.hasMusic);
    let clipCount = body.clipCount ?? 1;
    let segments = body.segments;
    let transcriptText = body.transcriptText;
    let activeRanges: { start: number; end: number }[] | undefined;
    let silenceRanges: { start: number; end: number }[] | undefined;
    let usedTranscript = false;
    let usedFfmpeg = false;

    if (body.projectId) {
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      videoTitle = project.name || videoTitle;
      if (!duration && project.spec?.clips?.length) {
        duration = project.spec.clips.reduce((s, c) => {
          const len = Math.max(0, (c.outPoint - c.inPoint) / (c.speed || 1));
          return s + len;
        }, 0);
      }
      if (!body.hasCaptions && project.spec?.texts?.length) hasCaptions = true;
      if (!body.hasMusic && (project.spec?.music || project.spec?.musicTracks?.length))
        hasMusic = true;
      if (!body.clipCount && project.spec?.clips) clipCount = project.spec.clips.length;

      const wanted =
        body.assetIds?.length
          ? project.assets.filter((a) => body.assetIds!.includes(a.id))
          : project.assets.filter((a) => a.kind === "video");
      const primary = wanted[0] || project.assets.find((a) => a.kind === "video");

      if (primary) {
        if (!duration) duration = primary.duration || duration;

        // Reuse cached transcript
        if (!segments?.length) {
          const cached = await loadCachedTranscript(project.id, primary.id);
          if (cached) {
            segments = cached.segments;
            transcriptText = transcriptText || cached.text;
            usedTranscript = true;
          }
        }

        // Optional Whisper (explicit) when no transcript yet
          if (!segments?.length && body.transcribe) {
          const media = assetMediaPath(project.id, primary.filename);
          try {
            await fs.access(media);
            const { ensureDataDirs, jobDir } = await import("@/lib/jobs");
            await ensureDataDirs();
            await fs.mkdir(jobDir(`editor-${project.id}`), { recursive: true });
            const result = await transcribeVideo(`editor-${project.id}`, media);
            segments = result.segments;
            transcriptText = segments.map((s) => s.text).join(" ");
            await saveCachedTranscript(project.id, primary.id, segments);
            usedTranscript = true;
          } catch (err) {
            console.warn("[ai/analyze] transcribe skipped", err);
          }
        }

        // FFmpeg silence → energy / silence markers
        try {
          const media = assetMediaPath(project.id, primary.filename);
          await fs.access(media);
          const { active, silences } = await detectActiveRanges(
            media,
            duration || primary.duration || 30,
          );
          activeRanges = active;
          silenceRanges = silences;
          usedFfmpeg = true;
        } catch {
          // no media on disk — heuristics only
        }
      }
    }

    if (!duration || duration < 0.5) duration = 30;

    const input: AnalyzeInput = {
      duration,
      videoTitle,
      transcriptText,
      segments,
      hasCaptions,
      hasMusic,
      clipCount,
      activeRanges,
      silenceRanges,
    };

    const { suggestions, score } = analyzeHeuristics(input);
    const snippet =
      transcriptText ||
      segments?.map((s) => s.text).join(" ") ||
      "";
    const refined = await refineSuggestionsWithLlm(suggestions, snippet);
    const cleanup = cleanupSuggestions({
      duration: duration || 60,
      transcriptText: snippet,
      segments,
    });

    return NextResponse.json({
      suggestions: refined.suggestions,
      score,
      cleanup,
      usedLlm: refined.usedLlm,
      usedTranscript,
      usedFfmpeg,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analyze failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
