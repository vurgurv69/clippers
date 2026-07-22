"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  clipLane,
  defaultText,
  DEFAULT_TRANSFORM,
  textHasContent,
  type ClipTransform,
  type ExportOptions,
  type MusicTrack,
  type Project,
  type ProjectAsset,
  type ReviewComment,
  type TextOverlay,
  type TimelineClip,
  type TimelineMarker,
  type TrackChrome,
  type TrackId,
  type TransitionKind,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";
import { activeMainIndex } from "@/lib/studio-timeline";
import {
  AI_MARKER_META,
  type AiSuggestion,
  type BrandKit,
  type CalendarEvent,
  type GrowthPack,
  type HookFixId,
  type ViralScorecard,
} from "@/lib/growth-types";
import { parseChapterLine } from "@/lib/growth-chapters";
import type { DubTrackPiece } from "@/lib/platform-types";
import type { GrowthRecAction } from "@/lib/growth-recommendations";
import type { AspectRatio } from "@/lib/types";
import type { ThumbnailLayoutPreset } from "@/lib/thumbnail-layout";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioGrowthArgs = {
  projectId: string;
  projectName: string;
  showGrowthHub: boolean;
  total: number;
  current: number;
  aspect: AspectRatio;
  freeV1: boolean;
  tracks: Record<TrackId, TrackChrome>;
  rootClipsRef: MutableRefObject<TimelineClip[]>;
  viewClips: TimelineClip[];
  starts: number[];
  assets: ProjectAsset[];
  selectedClip: TimelineClip | null;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  texts: TextOverlay[];
  exportOpts: ExportOptions;
  brandKit: BrandKit | null;
  growthPack: GrowthPack | null;
  setShowGrowthHub: Dispatch<SetStateAction<boolean>>;
  setGrowthPack: Dispatch<SetStateAction<GrowthPack | null>>;
  setBrandKit: Dispatch<SetStateAction<BrandKit | null>>;
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  setReviewComments: Dispatch<SetStateAction<ReviewComment[]>>;
  setViralScore: Dispatch<SetStateAction<ViralScorecard | null>>;
  setAiSuggestions: Dispatch<SetStateAction<AiSuggestion[]>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setNestPath: Dispatch<SetStateAction<string[]>>;
  setTexts: Dispatch<SetStateAction<TextOverlay[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setMarkers: Dispatch<SetStateAction<TimelineMarker[]>>;
  setFreeV1: Dispatch<SetStateAction<boolean>>;
  setTracks: Dispatch<SetStateAction<Record<TrackId, TrackChrome>>>;
  setAspect: Dispatch<SetStateAction<AspectRatio>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  seek: (t: number) => void;
  patchTransform: (id: string, patch: Partial<ClipTransform>) => void;
  insertTextStyle: (style: Partial<TextOverlay>, label: string) => void;
  applyTransitionKind: (kind: TransitionKind, duration?: number, outgoingId?: string) => void;
  refreshExportJobs: () => Promise<void>;
  runAiAnalyze: () => void | Promise<void>;
  runAiReframe: () => void | Promise<void>;
  pushToast: ToastFn;
};

/** Growth Hub actions: brand, calendar, thumbs, dub, cloud pull, share. */
export function useStudioGrowth(args: StudioGrowthArgs) {
  const {
    projectId,
    projectName,
    showGrowthHub,
    total,
    current,
    aspect,
    freeV1,
    tracks,
    rootClipsRef,
    viewClips,
    starts,
    assets,
    selectedClip,
    music,
    musicTracks,
    texts,
    exportOpts,
    brandKit,
    growthPack,
    setShowGrowthHub,
    setGrowthPack,
    setBrandKit,
    setCalendarEvents,
    setReviewComments,
    setViralScore,
    setAiSuggestions,
    setAssets,
    setViewClips,
    setClips,
    setNestPath,
    setTexts,
    setMusic,
    setMusicTracks,
    setMarkers,
    setFreeV1,
    setTracks,
    setAspect,
    setSidebarTab,
    setTab,
    setSelectedId,
    setSelectedIds,
    seek,
    patchTransform,
    insertTextStyle,
    applyTransitionKind,
    refreshExportJobs,
    runAiAnalyze,
    runAiReframe,
    pushToast,
  } = args;

  useEffect(() => {
    if (!showGrowthHub) return;
    void (async () => {
      try {
        const res = await fetch(`/api/editor/project/${projectId}`);
        const data = await res.json();
        if (res.ok && data.project?.comments) {
          setReviewComments(data.project.comments as ReviewComment[]);
        }
      } catch {
        // ignore
      }
    })();
  }, [showGrowthHub, projectId, setReviewComments]);

  const applyDubTracks = useCallback(
    (dubTracks: DubTrackPiece[], muteDialogue: boolean) => {
      const assetsIn: ProjectAsset[] = dubTracks.map((t) => ({
        id: t.asset.id,
        kind: "audio" as const,
        name: t.asset.name,
        filename: t.asset.filename,
        duration: t.asset.duration,
        hasAudio: true,
        tags: t.asset.tags,
      }));
      setAssets((prev) => {
        const ids = new Set(prev.map((a) => a.id));
        return [...prev, ...assetsIn.filter((a) => !ids.has(a.id))];
      });
      const lanes: MusicTrack[] = dubTracks.map((t) => ({
        assetId: t.asset.id,
        start: t.start,
        inPoint: 0,
        outPoint: Math.max(0.2, t.duration),
        volume: 1,
        fadeIn: 0.05,
        fadeOut: 0.08,
      }));
      setMusicTracks((prev) => [...prev, ...lanes]);
      if (muteDialogue) {
        setViewClips((prev) =>
          prev.map((c) =>
            clipLane(c) === 0 ? { ...c, volume: 0, linkedAudio: false } : c,
          ),
        );
      }
      setSidebarTab("media");
      setTab("audio");
      pushToast(`Dub: ${lanes.length} clips on music lane`, "success");
    },
    [pushToast, setAssets, setMusicTracks, setSidebarTab, setTab, setViewClips],
  );

  const applyAiSuggestion = useCallback(
    (s: AiSuggestion) => {
      seek(s.start);
      const idx = activeMainIndex(viewClips, starts, s.start);
      if (idx >= 0) {
        const clip = viewClips[idx];
        if (clip) {
          setSelectedId(clip.id);
          setSelectedIds([clip.id]);
        }
      }
      const meta = AI_MARKER_META[s.kind];
      const rangeMarks: TimelineMarker[] = [
        {
          id: uid("ai-in"),
          t: s.start,
          label: `${s.emoji} In`,
          color: meta?.color || "#12d6a0",
        },
        {
          id: uid("ai-out"),
          t: s.end,
          label: `${s.emoji} Out`,
          color: meta?.color || "#12d6a0",
        },
      ];
      setMarkers((prev) => [...prev, ...rangeMarks].sort((a, b) => a.t - b.t));
      pushToast("Clip ready — range marked on timeline", "success");
    },
    [pushToast, seek, setMarkers, setSelectedId, setSelectedIds, starts, viewClips],
  );

  const applyHookFix = useCallback(
    (id: HookFixId | string) => {
      const clip = selectedClip || viewClips[activeMainIndex(viewClips, starts, current)];
      if (id === "zoom" || id === "punch") {
        if (!clip) {
          pushToast("Select a clip first", "info");
          return;
        }
        const tr = clip.transform || DEFAULT_TRANSFORM;
        const scale = id === "punch" ? 1.22 : 1.15;
        patchTransform(clip.id, {
          scaleX: (tr.scaleX || 1) * scale,
          scaleY: (tr.scaleY || 1) * scale,
        });
        pushToast(id === "punch" ? "Punch-in applied" : "Zoom punch-in applied", "success");
        return;
      }
      if (id === "captions") {
        insertTextStyle(
          {
            text: "WATCH THIS",
            size: 0.1,
            y: 0.72,
            bold: true,
            color: "#ffe600",
            stroke: 5,
            strokeColor: "#000",
            font: "Arial Black",
            anim: "slide",
            transform: "upper",
          },
          "Hook captions",
        );
        return;
      }
      if (id === "music") {
        const bed =
          assets.find((a) => a.kind === "audio" && a.tags?.includes("music-bed")) ||
          assets.find((a) => a.kind === "audio");
        if (!bed) {
          setSidebarTab("media");
          pushToast("Import a music bed to lift the opening", "info");
          return;
        }
        const track: MusicTrack = {
          assetId: bed.id,
          start: 0,
          inPoint: 0,
          outPoint: Math.min(bed.duration || 30, Math.max(8, total || 12)),
          volume: 0.55,
          fadeIn: 0.4,
          fadeOut: 0.8,
          duck: 0.7,
        };
        if (music) {
          setMusicTracks((prev) => [...prev, track]);
        } else {
          setMusic(track);
        }
        setSidebarTab("media");
        setTab("audio");
        pushToast(`Music bed + duck on “${bed.name.slice(0, 24)}”`, "success");
        return;
      }
      if (id === "transition") {
        if (!clip) {
          pushToast("Select a clip first", "info");
          return;
        }
        setSelectedId(clip.id);
        applyTransitionKind("flash", 0.35);
      }
    },
    [
      applyTransitionKind,
      assets,
      current,
      insertTextStyle,
      music,
      patchTransform,
      pushToast,
      selectedClip,
      setMusic,
      setMusicTracks,
      setSelectedId,
      setSidebarTab,
      setTab,
      starts,
      total,
      viewClips,
    ],
  );

  const applyBrandKitToTimeline = useCallback(
    (kit: BrandKit) => {
      setTexts((prev) => {
        let next: TextOverlay[] = prev.map((t) => ({
          ...t,
          color: kit.primary || t.color,
          strokeColor: kit.secondary || t.strokeColor,
          shadowColor: kit.accent || t.shadowColor,
          font: kit.fontHeading || t.font,
          bgColor: kit.secondary || t.bgColor,
        }));
        next = next.filter(
          (t) => !t.id.startsWith("brandlogo") && !t.id.startsWith("brandwm"),
        );
        if (kit.logoUrl?.trim()) {
          next.push({
            ...defaultText(uid("brandlogo"), 0),
            text: " ",
            stickerUrl: kit.logoUrl.trim(),
            duration: Math.max(total, 4),
            start: 0,
            x: 0.88,
            y: 0.1,
            size: 0.08,
            color: kit.primary,
          });
        }
        if (kit.watermark?.trim()) {
          next.push({
            ...defaultText(uid("brandwm"), 0),
            text: kit.watermark.trim(),
            duration: Math.max(total, 4),
            start: 0,
            x: 0.82,
            y: 0.94,
            size: 0.032,
            color: kit.primary || "#ffffff",
            opacity: 0.75,
            bold: false,
            stroke: 1,
            strokeColor: kit.secondary || "#000000",
            font: kit.fontBody || "Arial",
            anim: "none",
          });
        }
        return next;
      });
      pushToast("Brand kit applied to text", "success");
    },
    [pushToast, setTexts, total],
  );

  const applyChaptersAsMarkers = useCallback(
    (chapters: string[]) => {
      const marks: TimelineMarker[] = [];
      for (const line of chapters) {
        const parsed = parseChapterLine(line);
        if (!parsed) continue;
        marks.push({
          id: uid("ch"),
          t: parsed.t,
          label: `📌 ${parsed.label}`,
          color: "#a78bfa",
        });
      }
      if (!marks.length) {
        pushToast("No chapter times found", "info");
        return;
      }
      setMarkers((prev) => {
        const kept = prev.filter((m) => !m.label.startsWith("📌"));
        return [...kept, ...marks].sort((a, b) => a.t - b.t);
      });
      pushToast(`${marks.length} chapter markers added`, "success");
    },
    [pushToast, setMarkers],
  );

  const hydrateFromCloudProject = useCallback(
    (remote: Project) => {
      const spec = remote.spec;
      if (!spec) {
        pushToast("Cloud snapshot has no timeline", "info");
        return;
      }
      setAspect(spec.aspect || remote.aspect || aspect);
      setClips(spec.clips || []);
      setNestPath([]);
      setTexts(spec.texts || []);
      setMusic(spec.music || null);
      setMusicTracks(spec.musicTracks || []);
      setMarkers(spec.markers || []);
      setFreeV1(Boolean(spec.freeMain));
      if (spec.tracks) {
        setTracks((prev) => ({ ...prev, ...spec.tracks } as typeof prev));
      }
      if (spec.growthPack) {
        setGrowthPack(spec.growthPack);
        setViralScore(spec.growthPack.score);
      }
      if (spec.brandKit) setBrandKit(spec.brandKit);
      if (spec.calendarEvents) setCalendarEvents(spec.calendarEvents);
      if (spec.aiMarkers) setAiSuggestions(spec.aiMarkers);
      if (remote.assets?.length) setAssets(remote.assets);
      if (remote.comments) setReviewComments(remote.comments);
      pushToast("Cloud pull applied to timeline", "success");
    },
    [
      aspect,
      pushToast,
      setAiSuggestions,
      setAspect,
      setAssets,
      setBrandKit,
      setCalendarEvents,
      setClips,
      setFreeV1,
      setGrowthPack,
      setMarkers,
      setMusic,
      setMusicTracks,
      setNestPath,
      setReviewComments,
      setTexts,
      setTracks,
      setViralScore,
    ],
  );

  const syncCalendarFromJobs = useCallback(
    (jobs: { title: string; dueAt: string; status: string; platform: string }[]) => {
      setCalendarEvents((prev) => {
        let changed = false;
        const next = prev.map((ev) => {
          const job = jobs.find(
            (j) =>
              j.dueAt.slice(0, 10) === ev.date &&
              (j.title === ev.title ||
                (ev.platform && j.platform === ev.platform)),
          );
          if (!job) return ev;
          const status =
            job.status === "done"
              ? ("posted" as const)
              : job.status === "cancelled" || job.status === "error"
                ? ("draft" as const)
                : ("scheduled" as const);
          if (ev.status === status) return ev;
          changed = true;
          return { ...ev, status };
        });
        return changed ? next : prev;
      });
    },
    [setCalendarEvents],
  );

  const generateGrowthThumb = useCallback(
    async (
      headline: string,
      layout?: ThumbnailLayoutPreset,
    ): Promise<string | null> => {
      const clip = selectedClip || viewClips[activeMainIndex(viewClips, starts, current)];
      const assetId = clip?.assetId || assets.find((a) => a.kind === "video")?.id;
      if (!assetId) {
        pushToast("No media for thumbnail", "info");
        return null;
      }
      try {
        const res = await fetch("/api/ai/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            assetId,
            t: current,
            headline,
            layout: layout || "bold-center",
            primary: brandKit?.primary,
            accent: brandKit?.accent,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Thumb failed");
        return (data.url as string) || null;
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Thumb failed", "error");
        return null;
      }
    },
    [assets, brandKit?.accent, brandKit?.primary, current, projectId, pushToast, selectedClip, starts, viewClips],
  );

  const batchExportAspects = useCallback(
    async (aspects: AspectRatio[]) => {
      const anySolo = Object.values(tracks).some((t) => t.solo);
      const audible = (id: TrackId) => (anySolo ? tracks[id].solo : !tracks[id].muted);
      const visible = (id: TrackId) => !tracks[id].hidden;

      const exportClips = rootClipsRef.current
        .filter((c) => {
          const lane = clipLane(c);
          if (lane === 0) return visible("video");
          if (lane === 1) return visible("overlay");
          return visible("overlay2");
        })
        .map((c) => {
          const lane = clipLane(c);
          const trackId: TrackId =
            lane === 0 ? "video" : lane === 1 ? "overlay" : "overlay2";
          if (!audible(trackId)) return { ...c, volume: 0, linkedAudio: false as const };
          return c;
        });

      let queued = 0;
      for (const a of aspects) {
        const res = await fetch(`/api/editor/project/${projectId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aspect: a,
            clips: exportClips,
            freeMain: freeV1 || undefined,
            music: music && audible("music") ? music : undefined,
            musicTracks:
              musicTracks.length && audible("music") ? musicTracks : undefined,
            texts: visible("text") ? texts.filter((t) => textHasContent(t)) : [],
            export: { ...exportOpts },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Export ${a} failed`);
        queued++;
      }
      await refreshExportJobs();
      pushToast(`Queued ${queued} exports`, "success");
    },
    [
      exportOpts,
      freeV1,
      music,
      musicTracks,
      projectId,
      pushToast,
      refreshExportJobs,
      rootClipsRef,
      texts,
      tracks,
    ],
  );

  const exportThumbnail = useCallback(
    async (headline?: string) => {
      const clip = selectedClip || viewClips[activeMainIndex(viewClips, starts, current)];
      const assetId = clip?.assetId || assets.find((a) => a.kind === "video")?.id;
      if (!assetId) {
        pushToast("No media for thumbnail", "info");
        return;
      }
      try {
        const res = await fetch("/api/ai/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            assetId,
            t: current,
            headline: headline || growthPack?.titles?.tiktok?.[0] || projectName,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Thumb failed");
        pushToast("Thumbnail ready", "success");
        if (data.url) window.open(data.url, "_blank");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Thumb failed", "error");
      }
    },
    [
      assets,
      current,
      growthPack?.titles?.tiktok,
      projectId,
      projectName,
      pushToast,
      selectedClip,
      starts,
      viewClips,
    ],
  );

  const createShareLink = useCallback(async () => {
    try {
      const res = await fetch(`/api/editor/project/${projectId}/share`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Share failed");
      const url = `${window.location.origin}${data.url}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
      pushToast("Review link copied", "success");
      window.open(data.url, "_blank");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Share failed", "error");
    }
  }, [projectId, pushToast]);

  const applyTranslationCaptions = useCallback(
    (segs: { start: number; end: number; text: string }[], lang: string) => {
      const added = segs.slice(0, 12).map((s) => ({
        ...defaultText(uid("dub"), s.start),
        text: s.text,
        size: 0.055,
        y: 0.82,
        bold: true,
        stroke: 2,
        strokeColor: "#000",
      }));
      setTexts((prev) => [...prev, ...added]);
      setSidebarTab("ai");
      pushToast(`${lang} captions added (${added.length})`, "success");
    },
    [pushToast, setSidebarTab, setTexts],
  );

  const handleRecommendationAction = useCallback(
    (action: GrowthRecAction) => {
      setShowGrowthHub(false);
      switch (action) {
        case "captions":
          setSidebarTab("ai");
          break;
        case "reframe":
          void runAiReframe();
          break;
        case "music":
          setSidebarTab("media");
          setTab("audio");
          break;
        case "cleanup":
          setSidebarTab("cleanup");
          break;
        case "transcript":
          setSidebarTab("ai");
          break;
        case "analyze":
          void runAiAnalyze();
          break;
        default:
          break;
      }
    },
    [runAiAnalyze, runAiReframe, setShowGrowthHub, setSidebarTab, setTab],
  );

  const savePack = useCallback(
    (pack: GrowthPack) => {
      setGrowthPack(pack);
      setViralScore(pack.score);
    },
    [setGrowthPack, setViralScore],
  );

  const scheduleEvent = useCallback(
    (ev: CalendarEvent) => {
      setCalendarEvents((prev) => [...prev, ev]);
      pushToast("Scheduled locally", "success");
    },
    [pushToast, setCalendarEvents],
  );

  const upsertCalendarEvent = useCallback(
    (ev: CalendarEvent) => {
      setCalendarEvents((prev) => {
        const idx = prev.findIndex((e) => e.id === ev.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = ev;
          return next;
        }
        return [...prev, ev];
      });
      pushToast("Planner saved", "success");
    },
    [pushToast, setCalendarEvents],
  );

  const deleteCalendarEvent = useCallback(
    (id: string) => {
      setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
      pushToast("Event removed", "info");
    },
    [pushToast, setCalendarEvents],
  );

  const saveBrandKit = useCallback(
    (kit: BrandKit) => {
      setBrandKit(kit);
      pushToast("Brand kit saved", "success");
    },
    [pushToast, setBrandKit],
  );

  return {
    applyDubTracks,
    applyAiSuggestion,
    applyHookFix,
    applyBrandKitToTimeline,
    applyChaptersAsMarkers,
    hydrateFromCloudProject,
    syncCalendarFromJobs,
    generateGrowthThumb,
    batchExportAspects,
    exportThumbnail,
    createShareLink,
    applyTranslationCaptions,
    handleRecommendationAction,
    savePack,
    scheduleEvent,
    upsertCalendarEvent,
    deleteCalendarEvent,
    saveBrandKit,
  };
}
