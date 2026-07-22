"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  clipSourceLength,
  DEFAULT_TRANSFORM,
  textHasContent,
  type ClipKeyframe,
  type ClipTransform,
  type MusicTrack,
  type ProjectAsset,
  type TextOverlay,
  type TimelineClip,
  type TimelineMarker,
} from "@/lib/editor-types";
import { activeMainIndex } from "@/lib/studio-timeline";
import { uid } from "@/lib/studio-clip-ops";
import { buildCaptionsFromSegments, buildManualCaption } from "@/lib/studio-captions";
import { AI_MARKER_META, type AiSuggestion, type ViralScorecard } from "@/lib/growth-types";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type CleanupItem = {
  id: string;
  start: number;
  end: number;
  label: string;
  kind: "silence" | "filler";
};

export type StudioAiArgs = {
  projectId: string;
  projectName: string;
  total: number;
  current: number;
  texts: TextOverlay[];
  viewClips: TimelineClip[];
  starts: number[];
  assets: ProjectAsset[];
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  selectedClip: TimelineClip | null;
  aiSuggestions: AiSuggestion[];
  setAiSuggestions: Dispatch<SetStateAction<AiSuggestion[]>>;
  setViralScore: Dispatch<SetStateAction<ViralScorecard | null>>;
  setAiAnalyzing: Dispatch<SetStateAction<boolean>>;
  setCleanupItems: Dispatch<SetStateAction<CleanupItem[]>>;
  setMarkers: Dispatch<SetStateAction<TimelineMarker[]>>;
  setTexts: Dispatch<SetStateAction<TextOverlay[]>>;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  seek: (t: number) => void;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  patchTransform: (id: string, patch: Partial<ClipTransform>) => void;
  pushToast: ToastFn;
};

/** AI analyze / search / reframe + caption burn helpers. */
export function useStudioAi(args: StudioAiArgs) {
  const {
    projectId,
    projectName,
    total,
    current,
    texts,
    viewClips,
    starts,
    assets,
    music,
    musicTracks,
    selectedClip,
    aiSuggestions,
    setAiSuggestions,
    setViralScore,
    setAiAnalyzing,
    setCleanupItems,
    setMarkers,
    setTexts,
    setSelectedTextId,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    seek,
    patchClip,
    patchTransform,
    pushToast,
  } = args;

  const burnTranscriptCaptions = useCallback(
    (
      segments: {
        start: number;
        end: number;
        text: string;
        words?: { speakerId?: number }[];
      }[],
    ) => {
      const added = buildCaptionsFromSegments(segments);
      if (!added.length) {
        pushToast("No transcript lines to burn", "info");
        return;
      }
      setTexts((prev) => [...prev, ...added]);
      setSidebarTab("ai");
      setTab("text");
      pushToast(`Burned ${added.length} caption${added.length > 1 ? "s" : ""}`, "success");
    },
    [setTexts, setSidebarTab, setTab, pushToast],
  );

  const addManualCaption = useCallback(
    (opts: {
      text: string;
      start: number;
      duration: number;
      speaker?: number;
      important?: boolean;
    }) => {
      const t = buildManualCaption(opts);
      setTexts((prev) => [...prev, t]);
      setSelectedTextId(t.id);
      setTab("text");
      pushToast(`Subtitle at ${opts.start.toFixed(1)}s`, "success");
    },
    [setTexts, setSelectedTextId, setTab, pushToast],
  );

  const autoCaptionsFromSpeech = useCallback(async () => {
    const assetId =
      selectedClip?.assetId || assets.find((a) => a.kind === "video")?.id || null;
    if (!assetId) {
      pushToast("Import a video first", "info");
      return;
    }
    pushToast("Transcribing for captions…", "info");
    try {
      const res = await fetch("/api/ai/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcribe failed");
      burnTranscriptCaptions(data.segments || []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Caption failed", "error");
      setSidebarTab("ai");
    }
  }, [selectedClip?.assetId, assets, projectId, burnTranscriptCaptions, pushToast, setSidebarTab]);

  const runAiAnalyze = useCallback(async () => {
    setAiAnalyzing(true);
    try {
      const snippet = texts
        .filter((t) => textHasContent(t))
        .map((t) => t.text)
        .join(" ");
      const assetIds = viewClips
        .map((c) => c.assetId)
        .filter(Boolean)
        .filter((id, i, arr) => arr.indexOf(id) === i);
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          assetIds,
          duration: total,
          videoTitle: projectName || "Clip",
          transcriptText: snippet || undefined,
          hasCaptions: texts.some((t) => textHasContent(t)),
          hasMusic: Boolean(music || musicTracks.length),
          clipCount: viewClips.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyze failed");
      const suggestions = (data.suggestions || []) as AiSuggestion[];
      setAiSuggestions(suggestions);
      setViralScore(data.score as ViralScorecard);
      const fromApi = Array.isArray(data.cleanup)
        ? (data.cleanup as CleanupItem[])
        : [];
      const fromMarkers = suggestions
        .filter((s) => s.kind === "silence" || s.kind === "pause")
        .map((s) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          label: s.label,
          kind: "silence" as const,
        }));
      const merged = [...fromApi];
      for (const m of fromMarkers) {
        if (!merged.some((x) => Math.abs(x.start - m.start) < 0.2)) merged.push(m);
      }
      setCleanupItems(merged.slice(0, 12));
      if (suggestions.length) {
        const next: TimelineMarker[] = suggestions.map((s) => ({
          id: uid(`ai-${s.kind}`),
          t: s.start,
          label: s.label,
          color: AI_MARKER_META[s.kind]?.color || "#12d6a0",
        }));
        setMarkers((prev) => {
          const kept = prev.filter(
            (m) => !m.label.match(/^(🔥|😂|💔|📈|🤫|⏸|🚀|❓|📖|👉|💡|😲)/),
          );
          return [...kept, ...next].sort((a, b) => a.t - b.t);
        });
      }
      const bits = [
        data.usedLlm ? "LLM" : null,
        data.usedTranscript ? "transcript" : null,
        data.usedFfmpeg ? "audio energy" : null,
      ].filter(Boolean);
      pushToast(
        bits.length ? `AI analyze ready (${bits.join(" · ")})` : "AI analyze ready",
        "success",
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Analyze failed", "error");
    } finally {
      setAiAnalyzing(false);
    }
  }, [
    setAiAnalyzing,
    texts,
    viewClips,
    projectId,
    total,
    projectName,
    music,
    musicTracks,
    setAiSuggestions,
    setViralScore,
    setCleanupItems,
    setMarkers,
    pushToast,
  ]);

  const applyAiMarkers = useCallback(() => {
    if (!aiSuggestions.length) {
      pushToast("Analyze first", "info");
      return;
    }
    const next: TimelineMarker[] = aiSuggestions.map((s) => ({
      id: uid(`ai-${s.kind}`),
      t: s.start,
      label: s.label,
      color: AI_MARKER_META[s.kind]?.color || "#12d6a0",
    }));
    setMarkers((prev) => {
      const kept = prev.filter((m) => !m.label.match(/^(🔥|😂|💔|📈|🤫|⏸|🚀|❓|📖|👉|💡|😲)/));
      return [...kept, ...next].sort((a, b) => a.t - b.t);
    });
    pushToast(`${next.length} AI markers dropped`, "success");
  }, [aiSuggestions, setMarkers, pushToast]);

  const runAiSearch = useCallback(
    async (query: string, mode: "keyword" | "semantic" = "semantic") => {
      try {
        const res = await fetch("/api/ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, query, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed");
        const hit = data.hits?.[0] as { start: number; text: string } | undefined;
        if (!hit) {
          pushToast(data.message || "No matches — transcribe first", "info");
          setSidebarTab("ai");
          return;
        }
        seek(hit.start);
        const modeHint =
          data.mode === "semantic" && data.usedLlm
            ? "semantic"
            : data.resolvedMode === "expanded"
              ? "expanded"
              : "keyword";
        pushToast(`Found (${modeHint}): ${hit.text.slice(0, 48)}`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Search failed", "error");
      }
    },
    [projectId, pushToast, setSidebarTab, seek],
  );

  const runAiReframe = useCallback(async () => {
    const clip = selectedClip || viewClips[activeMainIndex(viewClips, starts, current)];
    if (!clip?.assetId) {
      pushToast("Select a video clip first", "info");
      return;
    }
    try {
      pushToast("Tracking face across clip…", "info");
      const res = await fetch("/api/ai/reframe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          assetId: clip.assetId,
          track: true,
          keyframes: true,
          inPoint: clip.inPoint,
          duration: clipSourceLength(clip),
          samples: 7,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reframe failed");

      const trackPoints = data.trackPoints as
        | { t: number; x: number; y: number; scaleX: number; scaleY: number }[]
        | undefined;

      if (trackPoints && trackPoints.length > 1) {
        const keys: ClipKeyframe[] = trackPoints.map((p, i) => ({
          id: uid(`trk-${i}`),
          t: Math.min(1, Math.max(0, p.t)),
          x: p.x,
          y: p.y,
          scaleX: p.scaleX,
          scaleY: p.scaleY,
          ease: "easeInOut" as const,
        }));
        const keep = (clip.keyframes || []).filter(
          (k) =>
            k.opacity !== undefined ||
            k.volume !== undefined ||
            k.rotation !== undefined ||
            k.brightness !== undefined,
        );
        patchClip(clip.id, {
          transform: {
            ...DEFAULT_TRANSFORM,
            ...(clip.transform || {}),
            ...data.transform,
          },
          keyframes: [...keep, ...keys].sort((a, b) => a.t - b.t),
        });
        pushToast(
          `${data.reason || "Face track applied"} · ${keys.length} keyframes`,
          "success",
        );
      } else {
        patchTransform(clip.id, data.transform);
        const toast =
          data.tracked && data.samples
            ? `${data.reason || "Reframe applied"} · ${data.samples} tracked samples`
            : data.reason || "Reframe applied";
        pushToast(toast, "success");
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Reframe failed", "error");
    }
  }, [
    selectedClip,
    viewClips,
    starts,
    current,
    projectId,
    patchClip,
    patchTransform,
    pushToast,
  ]);

  return {
    burnTranscriptCaptions,
    addManualCaption,
    autoCaptionsFromSpeech,
    runAiAnalyze,
    applyAiMarkers,
    runAiSearch,
    runAiReframe,
  };
}
