"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { AspectRatio } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import {
  clipLength,
  clipLane,
  clipSourceLength,
  defaultClip,
  DEFAULT_EXPORT,
  DEFAULT_TRACKS,
  DEFAULT_TRANSFORM,
  DEFAULT_COLOR,
  DEFAULT_BEZIER,
  sampleKeyframe,
  textHasContent,
  type BezierHandles,
  type ClipKeyframe,
  type ClipTransform,
  type KeyframeEase,
  type ExportOptions,
  type MusicTrack,
  type Project,
  type ProjectAsset,
  type TextOverlay,
  type TimelineClip,
  type TimelineMarker,
  type TrackChrome,
  type TrackId,
  type TransitionKind,
  type ReviewComment,
} from "@/lib/editor-types";
import {
  loadKeymap,
  useKeyboardShortcuts,
  type ShortcutAction,
} from "@/hooks/useKeyboardShortcuts";
import type { ToolId } from "@/lib/edit-tools";
import { clamp } from "@/lib/edit-tools";
import { useStudioPlayback, STUDIO_PLAYBACK_FPS } from "@/hooks/studio/useStudioPlayback";
import { useStudioTimelineOps } from "@/hooks/studio/useStudioTimelineOps";
import { useStudioExport } from "@/hooks/studio/useStudioExport";
import { useStudioMedia } from "@/hooks/studio/useStudioMedia";
import { useStudioAi } from "@/hooks/studio/useStudioAi";
import { useStudioGrowth } from "@/hooks/studio/useStudioGrowth";
import { useStudioNest } from "@/hooks/studio/useStudioNest";
import { useStudioOverlays } from "@/hooks/studio/useStudioOverlays";
import { useStudioEffects } from "@/hooks/studio/useStudioEffects";
import { useStudioCleanup } from "@/hooks/studio/useStudioCleanup";
import { useStudioMarkers } from "@/hooks/studio/useStudioMarkers";
import { useStudioMusic } from "@/hooks/studio/useStudioMusic";
import { useStudioSelection } from "@/hooks/studio/useStudioSelection";
import { useStudioBroll } from "@/hooks/studio/useStudioBroll";
import { useStudioCommands } from "@/hooks/studio/useStudioCommands";
import { useStudioHistory } from "@/hooks/studio/useStudioHistory";
import { useStudioLinkedAv } from "@/hooks/studio/useStudioLinkedAv";
import { useStudioPreviewSync } from "@/hooks/studio/useStudioPreviewSync";
import { useStudioTimelineChrome } from "@/hooks/studio/useStudioTimelineChrome";
import { useStudioClipPatch } from "@/hooks/studio/useStudioClipPatch";
import { useStudioWorkspace } from "@/hooks/studio/useStudioWorkspace";
import { useStudioFavs } from "@/hooks/studio/useStudioFavs";
import { useStudioShellBoot } from "@/hooks/studio/useStudioShellBoot";
import { startPanelResize as beginPanelResize } from "@/lib/studio-panel-resize";
import { buildStudioInspectorCtx } from "@/components/editor/inspector/buildStudioInspectorCtx";
import { getClipsAtPath, updateClipsAtPath } from "@/lib/studio-nest";
import {
  fmtTime,
  uid,
} from "@/lib/studio-clip-ops";
import {
  activeMainIndex,
  computeTimeline,
} from "@/lib/studio-timeline";
import { StudioPreview } from "@/components/editor/StudioPreview";
import {
  StudioInspector,
  type InspectorTab as Tab,
} from "@/components/editor/StudioInspector";
import { InspectorTabPanels } from "@/components/editor/inspector/InspectorTabPanels";
import { StudioTimeline } from "@/components/editor/StudioTimeline";
import { StudioTopBar, type WorkspaceId } from "@/components/editor/StudioTopBar";
import { StudioToolbar } from "@/components/editor/StudioToolbar";
import { StudioSidebar, type SidebarTab } from "@/components/editor/StudioSidebar";
import { StudioMediaBin } from "@/components/editor/StudioMediaBin";
import {
  AnimationLibrary,
  EffectLibrary,
  FilterLibrary,
  StickerLibrary,
  TextLibrary,
  TransitionLibrary,
} from "@/components/editor/library/CapCutLibraries";
import { TemplateLibrary } from "@/components/editor/library/TemplateLibrary";
import { StudioStatusBar } from "@/components/editor/StudioStatusBar";
import { ClipContextMenu } from "@/components/editor/ClipContextMenu";
import { AiAssistantPanel } from "@/components/editor/ai/AiAssistantPanel";
import { TranscriptPanel } from "@/components/editor/ai/TranscriptPanel";
import { GrowthShellPanel } from "@/components/editor/growth/GrowthShellPanel";
import { type AiSuggestion, type BrandKit, type CalendarEvent, type GrowthPack, type ViralScorecard } from "@/lib/growth-types";
import type { ShellCard } from "@/lib/capcut-catalog";

const ExportDialog = dynamic(
  () =>
    import("@/components/editor/ExportDialog").then((m) => ({ default: m.ExportDialog })),
  { ssr: false },
);
const CommandPalette = dynamic(
  () =>
    import("@/components/editor/CommandPalette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);
const UndoHistoryPanel = dynamic(
  () =>
    import("@/components/editor/UndoHistoryPanel").then((m) => ({
      default: m.UndoHistoryPanel,
    })),
  { ssr: false },
);
const KeymapDialog = dynamic(
  () =>
    import("@/components/editor/KeymapDialog").then((m) => ({ default: m.KeymapDialog })),
  { ssr: false },
);
const StudioManual = dynamic(
  () =>
    import("@/components/editor/StudioManual").then((m) => ({ default: m.StudioManual })),
  { ssr: false },
);
const GrowthHub = dynamic(
  () =>
    import("@/components/editor/growth/GrowthHub").then((m) => ({ default: m.GrowthHub })),
  { ssr: false },
);

/** Timeline frame rate — matches the export renderer (editor-render FPS). */
const FPS = STUDIO_PLAYBACK_FPS;

type Toast = { id: string; msg: string; kind: "info" | "success" | "error" };

type ContextMenu = {
  x: number;
  y: number;
  clipId: string;
} | null;

const fmt = fmtTime;

export function StudioEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<ProjectAsset[]>(project.assets);
  const [clips, setClips] = useState<TimelineClip[]>(() => {
    if (project.spec?.clips?.length) return project.spec.clips;
    return project.assets
      .filter((a) => a.kind === "video" || a.kind === "image")
      .map((a) => defaultClip(a, uid("clip")));
  });
  /** Compound ids from root → current edit target (nested compounds supported). */
  const [nestPath, setNestPath] = useState<string[]>([]);
  const nestPathRef = useRef<string[]>([]);
  nestPathRef.current = nestPath;
  /** Always holds the full project timeline (export / save use this, never the nest view). */
  const rootClipsRef = useRef(clips);
  rootClipsRef.current = clips;
  const [aspect, setAspect] = useState<AspectRatio>(project.spec?.aspect || project.aspect);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => project.spec?.clips?.[0]?.id ?? null,
  );
  /** Multi-select set (always includes selectedId when set). Ctrl/Shift click. */
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = project.spec?.clips?.[0]?.id;
    return first ? [first] : [];
  });

  // If we built default clips (no saved spec), select the first one once.
  useEffect(() => {
    if (!selectedId && clips[0]) {
      setSelectedId(clips[0].id);
      setSelectedIds([clips[0].id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useStudioShellBoot();

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(70);
  const [expanded, setExpanded] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rippleEnabled, setRippleEnabled] = useState(true);
  const [darkTheme, setDarkTheme] = useState(true);
  const [binW, setBinW] = useState(340);
  const [inspectorW, setInspectorW] = useState(280);
  const [floatBin, setFloatBin] = useState(false);
  const [floatInspector, setFloatInspector] = useState(false);
  const [editTool, setEditTool] = useState<ToolId>("select");
  const [workspace, setWorkspace] = useState<WorkspaceId>("editing");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [uiLarge, setUiLarge] = useState(false);
  const [inspSearch, setInspSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [marquee, setMarquee] = useState<{
    x0: number;
    x1: number;
  } | null>(null);

  function startPanelResize(which: "bin" | "inspector", clientX0: number) {
    beginPanelResize(which, clientX0, binW, inspectorW, setBinW, setInspectorW);
  }

  const [tracks, setTracks] = useState<Record<TrackId, TrackChrome>>(() => {
    const saved = project.spec?.tracks;
    if (!saved) return { ...DEFAULT_TRACKS };
    const next = { ...DEFAULT_TRACKS };
    (Object.keys(DEFAULT_TRACKS) as TrackId[]).forEach((id) => {
      if (saved[id]) next[id] = { ...DEFAULT_TRACKS[id], ...saved[id] };
    });
    return next;
  });
  const patchTrack = (id: TrackId, patch: Partial<TrackChrome>) =>
    setTracks((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const [magnetic, setMagnetic] = useState(true);
  const [magDragActive, setMagDragActive] = useState(false);
  /** When on, V1 clips use `tlStart` (free place) instead of packing gapless. */
  const [freeV1, setFreeV1] = useState(() => Boolean(project.spec?.freeMain));
  const [defaultEase, setDefaultEase] = useState<KeyframeEase>("easeInOut");
  const [defaultBezier, setDefaultBezier] = useState<BezierHandles>([...DEFAULT_BEZIER]);
  const [viewScroll, setViewScroll] = useState({ left: 0, width: 900 });
  const [exportJobs, setExportJobs] = useState<
    Array<{
      id: string;
      status: string;
      error?: string;
      previewUrl?: string;
      downloadUrl?: string;
      format?: string;
      createdAt?: number;
      updatedAt?: number;
    }>
  >([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("clip");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("media");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [fxSearch, setFxSearch] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportOpts, setExportOpts] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [trSearch, setTrSearch] = useState("");
  const [showGrowthHub, setShowGrowthHub] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(
    () => project.spec?.aiMarkers ?? [],
  );
  const [viralScore, setViralScore] = useState<ViralScorecard | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [growthPack, setGrowthPack] = useState<GrowthPack | null>(
    () => project.spec?.growthPack ?? null,
  );
  const [brandKit, setBrandKit] = useState<BrandKit | null>(
    () => project.spec?.brandKit ?? null,
  );
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(
    () => project.spec?.calendarEvents ?? [],
  );
  const [cleanupItems, setCleanupItems] = useState<
    { id: string; start: number; end: number; label: string; kind: "silence" | "filler" }[]
  >([]);
  const [cleanupDenoiseLevel, setCleanupDenoiseLevel] = useState(0);
  const [cleanupStabilizeLevel, setCleanupStabilizeLevel] = useState(0);
  const [brollBusy, setBrollBusy] = useState(false);
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>(
    () => project.comments ?? [],
  );

  const { applyWorkspace } = useStudioWorkspace({
    setWorkspace,
    setBinW,
    setInspectorW,
    setFloatBin,
    setFloatInspector,
    setExpanded,
    setSidebarTab,
    setTab,
    setSidebarCollapsed,
    setInspectorCollapsed,
    setShowExport,
    setShowGrowthHub,
  });

  const { favTr, toggleFav, favAssets, toggleFavAsset } = useStudioFavs();

  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ downloadUrl: string; previewUrl: string } | null>(null);

  // Music lanes (primary + extras) + text lane (many blocks)
  const [music, setMusic] = useState<MusicTrack | null>(() => project.spec?.music ?? null);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>(
    () => project.spec?.musicTracks ?? [],
  );
  const [markers, setMarkers] = useState<TimelineMarker[]>(
    () => project.spec?.markers ?? [],
  );
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [showKeymap, setShowKeymap] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [keymap, setKeymap] = useState<Record<string, ShortcutAction>>(() => loadKeymap());
  const kfClipboardRef = useRef<ClipKeyframe[] | null>(null);
  const [texts, setTexts] = useState<TextOverlay[]>(() => project.spec?.texts ?? []);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Media library chrome
  const [mediaSearch, setMediaSearch] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(project.updatedAt || null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(true);
  const savingRef = useRef(false);

  // Transition preview panel
  const [previewTransition, setPreviewTransition] = useState<TransitionKind>("crossfade");

  // Pro preview controls (Phase 2)
  const [rate, setRate] = useState(1); // master playback rate
  const [dir, setDir] = useState<1 | -1>(1); // 1 forward, -1 reverse
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [guides, setGuides] = useState({ thirds: false, safe: false, center: false });
  /** Prefer low-res proxies in the preview monitor when available. */
  const [useProxy, setUseProxy] = useState(false);

  // Toast notifications (Phase 16)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [ctxMenu]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [mixerSolo, setMixerSolo] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const curRef = useRef<number>(0);
  const activeAssetRef = useRef<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<
    | { type: "clip"; data: TimelineClip }
    | { type: "text"; data: TextOverlay }
    | null
  >(null);
  const gradeClipboardRef = useRef<TimelineClip["color"] | null>(null);

  const pushToast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = uid("toast");
    setToasts((prev) => [...prev, { id, msg, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  /** Mutate the clips currently on the timeline (root or compound children at nestPath). */
  const setViewClips = useCallback(
    (updater: TimelineClip[] | ((prev: TimelineClip[]) => TimelineClip[])) => {
      setClips((root) => {
        const path = nestPathRef.current;
        const current = getClipsAtPath(root, path);
        const next = typeof updater === "function" ? updater(current) : updater;
        return updateClipsAtPath(root, path, next);
      });
    },
    [],
  );

  // Drop stale nest path entries if undo/delete removed a compound ancestor.
  useEffect(() => {
    if (!nestPath.length) return;
    let nodes = clips;
    for (let i = 0; i < nestPath.length; i++) {
      const parent = nodes.find((c) => c.id === nestPath[i]);
      if (!parent?.compound || !parent.children?.length) {
        setNestPath(nestPath.slice(0, i));
        return;
      }
      nodes = parent.children;
    }
  }, [clips, nestPath]);


  const {
    historyInfo,
    historyEntries,
    undo,
    redo,
    jumpHistory,
  } = useStudioHistory({
    clips,
    texts,
    music,
    musicTracks,
    tracks,
    freeV1,
    markers,
    setClips,
    setTexts,
    setMusic,
    setMusicTracks,
    setTracks,
    setFreeV1,
    setMarkers,
    pushToast,
  });

  useEffect(() => {
    dirtyRef.current = true;
  }, [clips, texts, music, musicTracks, markers, aspect, tracks, freeV1, growthPack, brandKit, calendarEvents, aiSuggestions]);

  const saveProjectState = useCallback(async (silent = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch(`/api/editor/project/${project.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: {
            aspect,
            clips,
            music: music ?? undefined,
            musicTracks: musicTracks.length ? musicTracks : undefined,
            markers: markers.length ? markers : undefined,
            texts: texts.filter((t) => textHasContent(t)),
            freeMain: freeV1 || undefined,
            tracks,
            growthPack: growthPack ?? undefined,
            aiMarkers: aiSuggestions.length ? aiSuggestions : undefined,
            brandKit: brandKit ?? undefined,
            calendarEvents: calendarEvents.length ? calendarEvents : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      dirtyRef.current = false;
      setLastSavedAt(data.updatedAt || new Date().toISOString());
      if (!silent) pushToast("Project saved", "success");
    } catch (err) {
      if (!silent) {
        pushToast(err instanceof Error ? err.message : "Save failed", "error");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [project.id, aspect, clips, music, musicTracks, markers, texts, tracks, freeV1, growthPack, brandKit, calendarEvents, aiSuggestions, pushToast]);

  // Autosave every ~4s when dirty
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && !savingRef.current) saveProjectState(true);
    }, 4000);
    return () => clearInterval(t);
  }, [saveProjectState]);

  const handleBackHome = useCallback(async () => {
    const start = Date.now();
    while (savingRef.current && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 80));
    }
    if (dirtyRef.current) {
      await saveProjectState(true);
    }
    onClose();
  }, [onClose, saveProjectState]);

  const {
    uploadFiles,
    generateProxy,
    generateProxiesBatch,
    cleanupUnusedMedia,
    deleteMediaAsset,
    replaceMediaAsset,
    renameMediaAsset,
  } = useStudioMedia({
    projectId: project.id,
    current,
    music,
    clips,
    musicTracks,
    assets,
    setAssets,
    setMusic,
    setMusicTracks,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    setUploading,
    setError,
    saveProjectState,
    pushToast,
  });

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const preset = ASPECT_PRESETS[aspect];

  const assetUrl = useCallback(
    (a: ProjectAsset, opts?: { full?: boolean }) => {
      // Prefer full-res until a proxy file actually exists (avoids 404 black preview).
      const preferProxy = useProxy && !opts?.full && Boolean(a.proxyFile);
      const file = preferProxy && a.proxyFile ? a.proxyFile : a.filename;
      return `/api/editor/project/${project.id}/asset/${encodeURIComponent(file)}`;
    },
    [project.id, useProxy],
  );
  const thumbUrl = useCallback(
    (a: ProjectAsset, t: number, w = 120) =>
      `/api/editor/project/${project.id}/thumb/${a.filename}?t=${Math.max(0, t).toFixed(2)}&w=${w}`,
    [project.id],
  );
  const waveformUrl = useCallback(
    (a: ProjectAsset, w = 800, h = 48) =>
      `/api/editor/project/${project.id}/waveform/${a.filename}?w=${w}&h=${h}`,
    [project.id],
  );

  const musicAsset = music ? assetById.get(music.assetId) : undefined;

  /** Clips shown/edited on the timeline — compound children when nested. */
  const viewClips = useMemo(
    () => getClipsAtPath(clips, nestPath),
    [clips, nestPath],
  );
  const nestedEditing = nestPath.length > 0;

  // Cumulative timeline math: main lane sequential; overlay lane free-placed.
  // While nested, only the compound's children are on the timeline (parent overlays hidden).
  const { starts, total } = useMemo(
    () => computeTimeline(viewClips, { freeMain: freeV1 || magDragActive }),
    [viewClips, freeV1, magDragActive],
  );

  /** Empty (or short) projects still get a scrubbable canvas so the playhead can be parked for inserts. */
  const scrubTotal = Math.max(total + 8, 60);

  const activeIndex = useMemo(
    () => activeMainIndex(viewClips, starts, current),
    [viewClips, starts, current],
  );

  const activeParent = activeIndex >= 0 ? viewClips[activeIndex] : null;
  /** Resolve compound children so preview plays the nested take at the playhead. */
  const { activeClip, activeAsset, activeLocalT } = useMemo(() => {
    if (!activeParent) return { activeClip: null as TimelineClip | null, activeAsset: null as ProjectAsset | null, activeLocalT: 0 };
    const clipStart = starts[activeIndex] || 0;
    let localT = Math.max(0, current - clipStart);
    if (activeParent.compound && activeParent.children?.length) {
      let acc = 0;
      for (const child of activeParent.children) {
        const len = clipLength(child);
        if (localT < acc + len - 1e-4) {
          return {
            activeClip: child,
            activeAsset: assetById.get(child.assetId) || null,
            activeLocalT: localT - acc,
          };
        }
        acc += len;
      }
      const last = activeParent.children[activeParent.children.length - 1];
      return {
        activeClip: last,
        activeAsset: assetById.get(last.assetId) || null,
        activeLocalT: 0,
      };
    }
    return {
      activeClip: activeParent,
      activeAsset: assetById.get(activeParent.assetId) || null,
      activeLocalT: localT,
    };
  }, [activeParent, activeIndex, starts, current, assetById]);

  /** Live preview blend when playhead is inside an outgoing clip's transition. */
  const transitionBlend = useMemo(() => {
    const mains = viewClips
      .map((c, i) => ({ c, i, s: starts[i] ?? 0 }))
      .filter((r) => clipLane(r.c) === 0 && !r.c.adjustment && !(r.c.multicamId && !r.c.multicamActive))
      .sort((a, b) => a.s - b.s || a.i - b.i);
    for (let k = 0; k < mains.length - 1; k++) {
      const a = mains[k];
      const b = mains[k + 1];
      const kind = a.c.transition;
      if (!kind || kind === "none") continue;
      const dur = Math.max(0.08, a.c.transitionDuration || 0.5);
      const end = a.s + clipLength(a.c);
      const t0 = end - dur;
      // Allow a hair past the cut so the incoming frame finishes the blend.
      if (current < t0 - 0.01 || current > end + 0.08) continue;
      const u = clamp((current - t0) / dur, 0, 1);
      return {
        kind,
        u,
        from: a.c,
        to: b.c,
        fromAsset: assetById.get(a.c.assetId) || null,
        toAsset: assetById.get(b.c.assetId) || null,
        fromLocal: Math.max(0, current - a.s),
        toLocal: Math.max(0, current - b.s),
      };
    }
    return null;
  }, [viewClips, starts, current, assetById]);

  const selectedClip = viewClips.find((c) => c.id === selectedId) || null;
  const selectedAsset = selectedClip ? assetById.get(selectedClip.assetId) : null;
  const selectedText = texts.find((t) => t.id === selectedTextId) || null;

  // Visible overlay clips (V2 / V3) at playhead for live preview compositing
  const visibleOverlays = useMemo(() => {
    if (nestedEditing) return [];
    return viewClips
      .map((c, i) => ({
        c,
        i,
        start: starts[i],
        asset: assetById.get(c.assetId) || null,
      }))
      .filter((x) => {
        const lane = clipLane(x.c);
        if (lane <= 0) return false;
        if (!x.c.adjustment && !x.asset) return false;
        const chrome = lane >= 2 ? tracks.overlay2 : tracks.overlay;
        if (chrome.hidden || chrome.muted) return false;
        return current >= x.start && current < x.start + clipLength(x.c);
      });
  }, [viewClips, starts, current, assetById, tracks.overlay, tracks.overlay2, nestedEditing]);

  // Visible text overlays at the current playhead
  const visibleTexts = useMemo(
    () =>
      nestedEditing
        ? []
        : texts.filter((t) => current >= t.start && current <= t.start + t.duration),
    [texts, current, nestedEditing],
  );

  const colorFilter = (c: TimelineClip | null, localT = 0) => {
    if (!c) return "none";
    const exposure = (c.color.exposure ?? 0) / 100;
    const temperature = (c.color.temperature ?? 0) / 100;
    const highlights = (c.color.highlights ?? 0) / 100;
    const shadows = (c.color.shadows ?? 0) / 100;
    const curve = (c.color.curve ?? 0) / 100;
    const len = clipLength(c);
    const u = len > 0 ? clamp(localT / len, 0, 1) : 0;
    const bri = sampleKeyframe(c.keyframes, "brightness", u, c.color.brightness);
    const lightness = (c.color.lightness ?? 0) / 100;
    const hueShift = c.color.hueShift ?? 0;
    const parts = [
      `brightness(${(bri * (1 + exposure * 0.5) * (1 + curve * 0.15) * (1 + lightness * 0.35)).toFixed(3)})`,
      `contrast(${(c.color.contrast * (1 + (highlights - shadows) * 0.15)).toFixed(3)})`,
      `saturate(${c.color.saturation})`,
    ];
    if (Math.abs(hueShift) > 0.05) parts.push(`hue-rotate(${Math.round(hueShift)}deg)`);
    // Approximate temperature: warm → sepia, cool → slight blue hue shift
    if (temperature > 0.001) parts.push(`sepia(${(temperature * 0.4).toFixed(2)})`);
    else if (temperature < -0.001) parts.push(`hue-rotate(${Math.round(temperature * 25)}deg)`);
    // Color-grade vignette (0..1) via soft contrast darkening approximation
    if ((c.color.vignette ?? 0) > 0.02) {
      parts.push(`brightness(${(1 - c.color.vignette * 0.12).toFixed(3)})`);
    }
    // Best-effort CSS approximation of the export effect stack (not all map).
    for (const fx of c.effects || []) {
      if (!fx.enabled) continue;
      const a = Math.max(0, Math.min(100, fx.amount)) / 100;
      switch (fx.kind) {
        case "blur":
          parts.push(`blur(${(a * 8).toFixed(1)}px)`);
          break;
        case "sharpen":
          parts.push(`contrast(${(1 + a * 0.4).toFixed(2)})`);
          break;
        case "hue":
          parts.push(`hue-rotate(${Math.round(a * 360)}deg)`);
          break;
        case "motionblur":
        case "glow":
        case "bloom":
          parts.push(`blur(${(a * 2).toFixed(1)}px)`);
          break;
        case "grain":
        case "posterize":
          parts.push(`contrast(${(1 + a * 0.15).toFixed(2)})`);
          break;
        case "tint":
          parts.push(`hue-rotate(${Math.round(a * 40)}deg)`);
          break;
        case "negate":
          parts.push("invert(1)");
          break;
        case "pixelate":
          parts.push(`contrast(${(1 + a * 0.1).toFixed(2)})`, `blur(${(0.2 + a * 0.4).toFixed(1)}px)`);
          break;
        case "rgbsplit":
          parts.push(
            `drop-shadow(${(a * 3).toFixed(1)}px 0 0 rgba(255,0,0,0.55))`,
            `drop-shadow(${(-a * 3).toFixed(1)}px 0 0 rgba(0,255,255,0.45))`,
          );
          break;
        case "vignette":
          parts.push(`brightness(${(1 - a * 0.25).toFixed(3)})`, `contrast(${(1 + a * 0.08).toFixed(2)})`);
          break;
        case "emboss":
          parts.push(`contrast(${(1 + a * 0.5).toFixed(2)})`, `brightness(${(1 + a * 0.1).toFixed(2)})`);
          break;
        case "shadow":
          parts.push(`drop-shadow(0 ${(2 + a * 8).toFixed(0)}px ${(4 + a * 10).toFixed(0)}px rgba(0,0,0,${(0.35 + a * 0.4).toFixed(2)}))`);
          break;
        case "wave":
          parts.push(`blur(${(a * 0.6).toFixed(1)}px)`);
          break;
        default:
          break;
      }
    }
    return parts.join(" ");
  };

  // Live preview transform: clip spatial transform + mirror + keyframes.
  const previewTransform = (c: TimelineClip | null, localT = 0) => {
    if (!c) return undefined;
    const base = { ...DEFAULT_TRANSFORM, ...(c.transform || {}) };
    const len = clipLength(c);
    const u = len > 0 ? clamp(localT / len, 0, 1) : 0;
    let x = sampleKeyframe(c.keyframes, "x", u, base.x);
    let y = sampleKeyframe(c.keyframes, "y", u, base.y);
    const scaleX = sampleKeyframe(c.keyframes, "scaleX", u, base.scaleX);
    const scaleY = sampleKeyframe(c.keyframes, "scaleY", u, base.scaleY);
    let rotation = sampleKeyframe(c.keyframes, "rotation", u, base.rotation);
    const mirror = (c.effects || []).some((f) => f.enabled && f.kind === "mirror");
    for (const fx of c.effects || []) {
      if (!fx.enabled) continue;
      const a = Math.max(0, Math.min(100, fx.amount)) / 100;
      if (fx.kind === "shake") {
        x += Math.sin(localT * 47.3) * a * 0.04;
        y += Math.cos(localT * 61.1) * a * 0.035;
        rotation += Math.sin(localT * 29.7) * a * 2.5;
      } else if (fx.kind === "wave") {
        x += Math.sin(localT * 8 + y * 10) * a * 0.03;
        rotation += Math.sin(localT * 6) * a * 1.5;
      }
    }
    const sx = scaleX * (mirror ? -1 : 1);
    return [
      `translate(${(x * 50).toFixed(2)}%, ${(y * 50).toFixed(2)}%)`,
      `rotate(${rotation.toFixed(1)}deg)`,
      `scale(${sx.toFixed(3)}, ${scaleY.toFixed(3)})`,
    ].join(" ");
  };
  const previewOpacity = (c: TimelineClip | null, localT = 0) => {
    if (!c) return 1;
    const base = c.transform?.opacity ?? 1;
    const len = clipLength(c);
    const u = len > 0 ? clamp(localT / len, 0, 1) : 0;
    return clamp(sampleKeyframe(c.keyframes, "opacity", u, base), 0, 1);
  };


  useStudioPreviewSync({
    videoRef,
    activeAssetRef,
    activeClip,
    activeAsset,
    activeLocalT,
    activeIndex,
    playing,
    useProxy,
    masterVolume,
    muted,
    tracks,
    assetUrl,
  });

  // ---------- master playback (extracted) ----------
  const {
    syncMusic,
    syncSfx,
    seek,
    togglePlay,
    playForward,
    playReverse,
    stopPlayback,
    stepFrame,
    toggleMute,
    toggleFullscreen,
  } = useStudioPlayback({
    videoRef,
    musicRef,
    sfxRefs,
    previewWrapRef,
    rafRef,
    lastTickRef,
    curRef,
    playing,
    setPlaying,
    setCurrent,
    rate,
    setRate,
    dir,
    setDir,
    loop,
    muted,
    setMuted,
    masterVolume,
    music,
    musicTracks,
    mixerSolo,
    tracks,
    viewClips,
    starts,
    total,
    scrubTotal,
    activeIndex,
    activeAsset,
    activeClip,
    assetById,
    nestedEditing,
    pushToast,
  });


  const { patchClip, applySpeedRamp, patchColor, patchTransform } = useStudioClipPatch({
    setViewClips,
    setSelectedId,
    pushToast,
  });

  const {
    addKeyframe,
    setAllKeyframeEase,
    removeNearbyKeyframe,
    moveKeyframe,
    copyKeyframes,
    pasteKeyframes,
    setEffects,
    addEffect,
    updateEffect,
    removeEffect,
    moveEffect,
  } = useStudioEffects({
    viewClips,
    starts,
    current,
    activeIndex,
    defaultEase,
    defaultBezier,
    kfClipboardRef,
    setDefaultEase,
    setDefaultBezier,
    setViewClips,
    patchClip,
    pushToast,
  });

  const {
    snapPoints,
    snapSec,
    clipInView,
    timeFromClientX,
    dragHandle,
    beginMagneticDrag,
    rippleMagneticWhileDrag,
    endMagneticDrag,
    splitClipAt,
    splitAtPlayhead,
    slipClip,
    slideClip,
    trimClipEdge,
    reorderTo,
  } = useStudioTimelineOps({
    trackRef,
    curRef,
    viewClips,
    setViewClips,
    starts,
    current,
    total,
    selectedId,
    setSelectedId,
    setSelectedIds,
    activeIndex,
    freeV1,
    magnetic,
    rippleEnabled,
    snapEnabled,
    pxPerSec,
    scrubTotal,
    viewScroll,
    assetById,
    texts,
    music,
    musicTracks,
    markers,
    nestedEditing,
    setMagDragActive,
    patchClip,
    pushToast,
  });


  const {
    addAssetToTimeline,
    addAssetAsOverlay,
    uploadBrollFile,
    generateBrollPreset,
    suggestAndInsertBroll,
  } = useStudioBroll({
    projectId: project.id,
    current,
    total,
    music,
    selectedClip,
    brandPrimary: brandKit?.primary,
    setAssets,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setMusic,
    setMusicTracks,
    setBrollBusy,
    setSidebarTab,
    setTab,
    patchColor,
    pushToast,
  });

  const {
    onMusicFile,
    onExtractAudioFromVideo,
    onImportYoutubeAudio,
    generateLibraryAudio,
    patchMusic,
    patchMusicTrack,
    removeMusicTrack,
  } = useStudioMusic({
    projectId: project.id,
    current,
    music,
    setMusic,
    setMusicTracks,
    setAssets,
    setUploadingMusic,
    setError,
    setTab,
    setSidebarTab,
    pushToast,
  });

  const {
    addMarker,
    seekPrevMarker,
    seekNextMarker,
    patchMarker,
    removeMarker,
  } = useStudioMarkers({
    current,
    markers,
    setMarkers,
    seek,
    pushToast,
  });

  const {
    burnTranscriptCaptions,
    addManualCaption,
    autoCaptionsFromSpeech,
    runAiAnalyze,
    applyAiMarkers,
    runAiSearch,
    runAiReframe,
  } = useStudioAi({
    projectId: project.id,
    projectName: project.name || "Clip",
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
  });

  function insertShellCard(card: ShellCard) {
    insertTextStyle(card.style, card.label);
  }


  const {
    rippleTrimRange,
    applyCleanupItem,
    applyCleanupAll,
    applyDenoiseToMainClips,
    applyDenoiseDialogue,
    applyStabilizeToMainClips,
    applyStabilizeMain,
    duckAllMusicBeds,
    applyAiEditPrompt,
    addAdjustmentLayer,
  } = useStudioCleanup({
    freeV1,
    current,
    assets,
    cleanupItems,
    selectedClip,
    music,
    musicTracks,
    setViewClips,
    setCleanupItems,
    setCleanupDenoiseLevel,
    setCleanupStabilizeLevel,
    setMusic,
    setMusicTracks,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    seek,
    pushToast,
  });

  const {
    addClipLayer,
    uploadClipLayerFile,
    renameClipLayer,
    removeClipLayer,
    patchClipLayer,
    enterCompound,
    exitCompound,
    createCompoundFromSelection,
    explodeCompound,
    createMulticamFromSelection,
    setMulticamActive,
    syncMulticamGroup,
    cutMulticamAtPlayhead,
  } = useStudioNest({
    projectId: project.id,
    viewClips,
    starts,
    current,
    selectedId,
    selectedIds,
    nestPath,
    assetById,
    setViewClips,
    setNestPath,
    setSelectedId,
    setSelectedIds,
    setAssets,
    setCurrent,
    setPlaying,
    curRef,
    musicRef,
    sfxRefs,
    patchClip,
    pushToast,
  });

  const {
    addText,
    insertTextStyle,
    patchText,
    deleteText,
    addSticker,
    addPackSticker,
    applyTransitionKind,
    onTransitionJunction,
    applyTransition,
    applyClipAnimation,
    detachClipAudio,
    relinkClipAudio,
  } = useStudioOverlays({
    projectId: project.id,
    current,
    viewClips,
    starts,
    selectedId,
    selectedClip,
    previewTransition,
    rippleEnabled,
    music,
    assetById,
    setPreviewTransition,
    setTexts,
    setSelectedTextId,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    setAssets,
    setMusic,
    setMusicTracks,
    setError,
    seek,
    patchClip,
    addAssetToTimeline,
    pushToast,
  });


  const {
    selectClip,
    deleteClip,
    duplicateClip,
    moveClip,
    moveClipToLane,
    copySelection,
    cutSelection,
    pasteClipboard,
    duplicateSelection,
  } = useStudioSelection({
    fps: FPS,
    viewClips,
    starts,
    current,
    selectedId,
    selectedIds,
    selectedClip,
    selectedText,
    selectedTextId,
    texts,
    freeV1,
    rippleEnabled,
    magnetic,
    tracks,
    clipboardRef,
    curRef,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setSelectedTextId,
    setTexts,
    setMusic,
    setMusicTracks,
    patchClip,
    deleteText,
    pushToast,
  });


  // ---------- export queue (extracted) ----------
  const { refreshExportJobs, exportVideo, cancelExport } = useStudioExport({
    projectId: project.id,
    aspect,
    freeV1,
    tracks,
    rootClipsRef,
    music,
    musicTracks,
    texts,
    exportOpts,
    activeJobId,
    setActiveJobId,
    setExportJobs,
    setExporting,
    setShowExport,
    setShowGrowthHub,
    setPlaying,
    setError,
    setResult,
    pushToast,
  });


  const {
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
  } = useStudioGrowth({
    projectId: project.id,
    projectName: project.name || "Untitled",
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
  });


  // ---------- shortcuts ----------
  useKeyboardShortcuts({
    onPlayPause: togglePlay,
    onSplit: splitAtPlayhead,
    onDelete: () => {
      if (selectedTextId) deleteText(selectedTextId);
      else if (selectedId) deleteClip(selectedId);
    },
    onSeekBack: () => stepFrame(-1),
    onSeekForward: () => stepFrame(1),
    onPrevClip: () => activeIndex > 0 && seek(starts[activeIndex - 1]),
    onNextClip: () => activeIndex < viewClips.length - 1 && seek(starts[activeIndex + 1]),
    onReverse: playReverse,
    onStop: stopPlayback,
    onForward: playForward,
    onFirstFrame: () => seek(0),
    onLastFrame: () => seek(total),
    onToggleMute: toggleMute,
    onAddMarker: addMarker,
    onPrevMarker: seekPrevMarker,
    onNextMarker: seekNextMarker,
    onUndo: undo,
    onRedo: redo,
    onCopy: copySelection,
    onCut: cutSelection,
    onPaste: pasteClipboard,
    onDuplicate: duplicateSelection,
    onSelectAll: () => {
      if (!viewClips.length) return;
      setSelectedIds(viewClips.map((c) => c.id));
      setSelectedId(viewClips[0].id);
      pushToast(`${viewClips.length} clips selected`, "info");
    },
    onSave: () => saveProjectState(false),
  }, true, keymap);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && cmdOpen) {
        setCmdOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        addMarker();
        return;
      }
      const map: Record<string, ToolId> = {
        v: "select",
        c: "blade",
        h: "hand",
        z: "zoom",
        t: "trim",
        r: "ripple",
        y: "slip",
        u: "slide",
        n: "roll",
      };
      const tool = map[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        setEditTool(tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen]);

  const studioCommands = useStudioCommands({
    togglePlay,
    splitAtPlayhead,
    setShowExport,
    saveProjectState,
    undo,
    redo,
    addText,
    addAdjustmentLayer,
    addMarker,
    seekPrevMarker,
    seekNextMarker,
    setHistoryOpen,
    applyWorkspace,
    setShowGrowthHub,
    setSidebarTab,
    runAiAnalyze,
    runAiReframe,
    suggestAndInsertBroll,
    createShareLink,
    exportThumbnail,
    setFloatBin,
    setFloatInspector,
    setUseProxy,
    generateProxiesBatch,
    duckAllMusicBeds,
    applySpeedRamp,
    selectedId,
    viewClips,
    starts,
    current,
    pushToast,
    setDarkTheme,
    setShowKeymap,
    setEditTool,
  });

  const [dragOver, setDragOver] = useState(false);

  const ticks = useMemo(() => {
    const step = pxPerSec < 40 ? 5 : pxPerSec < 90 ? 2 : 1;
    const out: number[] = [];
    for (let t = 0; t <= scrubTotal + 0.01; t += step) out.push(t);
    return out;
  }, [scrubTotal, pxPerSec]);

  // Minor tick marks between labels (1s, or 0.5s when zoomed in)
  const minorTicks = useMemo(() => {
    const step = pxPerSec > 140 ? 0.5 : 1;
    const out: number[] = [];
    for (let t = 0; t <= scrubTotal + 0.01; t += step) out.push(Math.round(t * 100) / 100);
    return out;
  }, [scrubTotal, pxPerSec]);


  useStudioLinkedAv({
    nestedEditing,
    viewClips,
    starts,
    music,
    setMusic,
    setMusicTracks,
  });

  const timelineWidth = Math.max(320, scrubTotal * pxPerSec);


  useStudioTimelineChrome({
    trackRef,
    playing,
    current,
    pxPerSec,
    setPxPerSec,
    setViewScroll,
  });

  const panelCtx = buildStudioInspectorCtx({
    projectId: project.id,
    tab,
    selectedClip,
    selectedAsset: selectedAsset ?? null,
    selectedIds,
    selectedText,
    assets,
    assetById,
    music,
    musicTracks,
    musicAsset,
    total,
    uploadingMusic,
    setUploadingMusic,
    fxSearch,
    setFxSearch,
    inspSearch,
    trSearch,
    setTrSearch,
    favTr,
    previewTransition,
    setPreviewTransition,
    defaultEase,
    defaultBezier,
    setDefaultBezier,
    patchClip,
    applySpeedRamp,
    patchColor,
    patchTransform,
    patchMusic,
    patchText,
    setMusic,
    setMusicTracks,
    mixerSolo,
    setMixerSolo,
    setAssets,
    addKeyframe,
    removeNearbyKeyframe,
    copyKeyframes,
    pasteKeyframes,
    setAllKeyframeEase,
    addEffect,
    updateEffect,
    moveEffect,
    removeEffect,
    detachClipAudio,
    relinkClipAudio,
    onMusicFile,
    onExtractAudioFromVideo,
    onImportYoutubeAudio,
    addText,
    addSticker,
    addPackSticker,
    deleteText,
    applyTransition,
    toggleFav,
    moveClip,
    duplicateClip,
    moveClipToLane,
    deleteClip,
    pushToast,
    gradeClipboardRef,
    markers,
    addMarker,
    patchMarker,
    removeMarker,
    addAdjustmentLayer,
    addClipLayer,
    uploadClipLayerFile,
    renameClipLayer,
    removeClipLayer,
    patchClipLayer,
    thumbUrl,
    assetUrl,
    setMulticamActive,
    cutMulticamAtPlayhead,
    syncMulticamGroup,
    clips: viewClips,
    useProxy,
    snapEnabled,
    setSnapEnabled,
    magnetic,
    setMagnetic,
    rippleEnabled,
    setRippleEnabled,
    freeV1,
    setUseProxy,
    setFreeV1,
    setViewClips,
  });


  return (
    <div className="studio-overlay" role="dialog" aria-modal="true">
      <div
        className={`studio-shell cc-shell${darkTheme ? " dark" : " light"}${floatBin ? " float-bin" : ""}${floatInspector ? " float-inspector" : ""}${uiLarge ? " ui-large" : ""}`}
        data-tool={editTool}
      >
        <StudioTopBar
          projectName={project.name || "Untitled"}
          darkTheme={darkTheme}
          setDarkTheme={setDarkTheme}
          canUndo={historyInfo.canUndo}
          canRedo={historyInfo.canRedo}
          onUndo={undo}
          onRedo={redo}
          onClose={handleBackHome}
          exporting={exporting}
          onCancelExport={cancelExport}
          onExport={() => setShowExport(true)}
          canExport={clips.length > 0}
          onOpenKeymap={() => setShowKeymap(true)}
          onOpenManual={() => setShowManual(true)}
          floatBin={floatBin}
          floatInspector={floatInspector}
          onToggleFloatBin={() => setFloatBin((v) => !v)}
          onToggleFloatInspector={() => setFloatInspector((v) => !v)}
          nestDepth={nestPath.length}
          onExitCompound={exitCompound}
          useProxy={useProxy}
          onToggleProxy={() => setUseProxy((v) => !v)}
          onOpenCommands={() => setCmdOpen(true)}
          uiLarge={uiLarge}
          onToggleUiLarge={() => setUiLarge((v) => !v)}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((s) => !s)}
          magnetic={magnetic}
          onToggleMagnetic={() => setMagnetic((m) => !m)}
          rippleEnabled={rippleEnabled}
          onToggleRipple={() => setRippleEnabled((r) => !r)}
        />

        <StudioToolbar
          tool={editTool}
          onSetTool={setEditTool}
          selectedId={selectedId}
          onDuplicate={() => selectedId && duplicateClip(selectedId)}
        />

        <div
          className="studio-body pro-body cc-body"
          style={
            {
              ["--cc-bin" as string]: sidebarCollapsed
                ? "78px"
                : `${binW}px`,
              ["--cc-insp" as string]: inspectorCollapsed
                ? "40px"
                : `${inspectorW}px`,
            } as CSSProperties
          }
        >
          <StudioSidebar
            tab={sidebarTab}
            onTab={setSidebarTab}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarTab === "media" && (
              <StudioMediaBin
                assets={assets}
                uploading={uploading}
                mediaSearch={mediaSearch}
                setMediaSearch={setMediaSearch}
                favAssets={favAssets}
                assetUrl={assetUrl}
                onUpload={uploadFiles}
                onCleanupUnused={cleanupUnusedMedia}
                onAdd={addAssetToTimeline}
                onAddOverlay={addAssetAsOverlay}
                onToggleFav={toggleFavAsset}
                onRename={renameMediaAsset}
                onReplace={replaceMediaAsset}
                onGenerateProxy={generateProxy}
                onGenerateProxiesBatch={generateProxiesBatch}
                onDelete={deleteMediaAsset}
              />
            )}
            {sidebarTab === "effects" && (
              <EffectLibrary
                onAdd={(kind) => {
                  const clip =
                    selectedClip ||
                    viewClips[activeMainIndex(viewClips, starts, current)] ||
                    viewClips[0];
                  if (!clip) {
                    pushToast("Add a video clip first", "info");
                    return;
                  }
                  if (!selectedClip) {
                    setSelectedId(clip.id);
                    setSelectedIds([clip.id]);
                  }
                  addEffect(clip.id, kind);
                  setTab("effects");
                }}
              />
            )}
            {sidebarTab === "transitions" && (
              <TransitionLibrary
                selected={selectedClip?.transition}
                favorites={favTr}
                duration={selectedClip?.transitionDuration || 0.5}
                onDuration={(d) => {
                  const clip =
                    selectedClip ||
                    viewClips[activeMainIndex(viewClips, starts, current)] ||
                    viewClips[0];
                  if (clip) patchClip(clip.id, { transitionDuration: d });
                }}
                onApply={(id) => applyTransitionKind(id)}
                onPreview={setPreviewTransition}
                onToggleFav={toggleFav}
              />
            )}
            {sidebarTab === "filters" && (
              <FilterLibrary
                selected={selectedClip?.color.preset}
                onApply={(id, grade) => {
                  const clip =
                    selectedClip ||
                    viewClips[activeMainIndex(viewClips, starts, current)] ||
                    viewClips[0];
                  if (!clip) {
                    pushToast("Add a video clip first", "info");
                    return;
                  }
                  if (!selectedClip) {
                    setSelectedId(clip.id);
                    setSelectedIds([clip.id]);
                  }
                  patchColor(clip.id, { ...grade, preset: id });
                  setTab("color");
                  pushToast("Filter applied", "success");
                }}
              />
            )}
            {sidebarTab === "animations" && (
              <AnimationLibrary
                onApplyText={(anim, label) => {
                  if (selectedText) {
                    patchText(selectedText.id, { anim });
                    setTab("text");
                    pushToast(`${label} applied to text`, "success");
                    return;
                  }
                  // Prefer animating the selected/active clip; otherwise add text.
                  if (selectedClip || viewClips.length > 0) {
                    applyClipAnimation(anim, label);
                    return;
                  }
                  insertTextStyle({ anim, text: label, size: 0.09, bold: true }, label);
                }}
              />
            )}
            {sidebarTab === "templates" && (
              <>
              <TemplateLibrary
                onPickAspect={(a) => {
                  setAspect(a);
                  pushToast(`${a} canvas ready — import media`, "success");
                  setSidebarTab("media");
                }}
                onApplyTextStyle={(style, label) => insertTextStyle(style, label)}
                onApplyColorGrade={(grade, label) => {
                  const clip =
                    selectedClip ||
                    viewClips[activeMainIndex(viewClips, starts, current)];
                  if (!clip) {
                    pushToast("Select a clip to apply color", "info");
                    return;
                  }
                  patchColor(clip.id, { ...grade, preset: "custom" });
                  pushToast(`${label} grade applied`, "success");
                }}
                brandKit={brandKit}
                onApplyBrandKit={(kit) => {
                  setBrandKit(kit);
                  applyBrandKitToTimeline(kit);
                }}
              />
              <TextLibrary onInsert={(style, label) => insertTextStyle(style, label)} />
              <StickerLibrary onGlyph={addSticker} onPack={addPackSticker} />
              </>
            )}
            {sidebarTab === "ai" && (
              <AiAssistantPanel
                projectId={project.id}
                duration={total}
                videoTitle={project.name}
                hasCaptions={texts.some((t) => textHasContent(t))}
                hasMusic={Boolean(music || musicTracks.length)}
                clipCount={viewClips.length}
                score={viralScore}
                suggestions={aiSuggestions}
                analyzing={aiAnalyzing}
                onAnalyze={() => void runAiAnalyze()}
                onApplySuggestion={applyAiSuggestion}
                onApplyMarkers={applyAiMarkers}
                onHookFix={applyHookFix}
                onOpenGrowthHub={() => setShowGrowthHub(true)}
                onReframe={() => void runAiReframe()}
                onSearchSeek={(q, mode) => void runAiSearch(q, mode ?? "semantic")}
                onApplyEditPrompt={applyAiEditPrompt}
                onAutoCaptions={() => void autoCaptionsFromSpeech()}
                onAddManualCaption={addManualCaption}
                captionsSlot={
                  <TranscriptPanel
                    embedded
                    projectId={project.id}
                    assetId={
                      selectedClip?.assetId ||
                      assets.find((a) => a.kind === "video")?.id ||
                      null
                    }
                    current={current}
                    onSeek={seek}
                    onRippleTrim={rippleTrimRange}
                    onReframe={() => void runAiReframe()}
                    onExportThumb={(h) => void exportThumbnail(h)}
                    onShare={() => void createShareLink()}
                    onBurnCaptions={burnTranscriptCaptions}
                    onAddManualCaption={addManualCaption}
                  />
                }
              />
            )}
            {sidebarTab === "broll" && (
              <GrowthShellPanel
                mode="broll"
                mediaAssets={assets}
                brollBusy={brollBusy}
                onInsertShell={insertShellCard}
                onInsertMediaOverlay={addAssetAsOverlay}
                onGenerateBroll={generateBrollPreset}
                onUploadBroll={uploadBrollFile}
                onSuggestBroll={suggestAndInsertBroll}
              />
            )}
            {sidebarTab === "cleanup" && (
              <GrowthShellPanel
                mode="cleanup"
                cleanupItems={cleanupItems}
                onSeek={seek}
                onApplyCleanup={applyCleanupItem}
                onApplyCleanupAll={applyCleanupAll}
                denoiseLevel={cleanupDenoiseLevel}
                onDenoiseChange={(level) => applyDenoiseToMainClips(level, { silent: true })}
                onDenoiseDialogue={applyDenoiseDialogue}
                stabilizeLevel={cleanupStabilizeLevel}
                onStabilizeChange={(level) => applyStabilizeToMainClips(level, { silent: true })}
                onStabilizeMain={applyStabilizeMain}
              />
            )}
            {sidebarTab === "motion" && (
              <GrowthShellPanel mode="motion" onInsertShell={insertShellCard} />
            )}
            {sidebarTab === "publish" && (
              <GrowthShellPanel
                mode="publish"
                onOpenGrowthHub={() => setShowGrowthHub(true)}
              />
            )}
          </StudioSidebar>

          {!sidebarCollapsed ? (
            <div
              className="panel-resizer"
              title="Drag to resize library"
              onPointerDown={(e) => startPanelResize("bin", e.clientX)}
            />
          ) : (
            <div className="panel-resizer inert" aria-hidden />
          )}

          <StudioPreview
            ref={previewWrapRef}
            aspectW={preset.w}
            aspectH={preset.h}
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
            }}
            videoRef={videoRef}
            musicRef={musicRef}
            sfxRefs={sfxRefs}
            sfxTracks={
              nestedEditing
                ? []
                : musicTracks
                    .map((track, i) => {
                      const asset = assetById.get(track.assetId);
                      if (!asset) return null;
                      return { id: `sfx-${i}-${track.assetId}`, asset, track };
                    })
                    .filter((x): x is NonNullable<typeof x> => Boolean(x))
            }
            activeClip={activeClip}
            activeAsset={activeAsset ?? null}
            activeLocalT={activeLocalT}
            transitionBlend={transitionBlend}
            colorFilter={colorFilter}
            previewTransform={previewTransform}
            previewOpacity={previewOpacity}
            assetUrl={assetUrl}
            assetById={assetById}
            overlayHidden={false}
            overlayMuted={false}
            visibleOverlays={visibleOverlays}
            current={current}
            visibleTexts={visibleTexts}
            selectedTextId={selectedTextId}
            projectId={project.id}
            onSelectText={(id) => {
              setSelectedTextId(id);
              setSelectedId(null);
            }}
            onPatchText={patchText}
            guides={guides}
            setGuides={setGuides}
            hasClips={viewClips.length > 0}
            hasMedia={assets.length > 0}
            onImportMedia={uploadFiles}
            music={Boolean(music) && !nestedEditing}
            musicAsset={musicAsset ?? null}
            fmt={fmt}
            total={total}
            fps={FPS}
            rate={rate}
            dir={dir}
            playing={playing}
            loop={loop}
            muted={muted}
            useProxy={useProxy}
            onTogglePlay={togglePlay}
            onStepFrame={stepFrame}
            onPlayReverse={playReverse}
            onPlayForward={playForward}
            onStop={stopPlayback}
            onSetRate={setRate}
            onSetDir={setDir}
            onToggleLoop={() => setLoop((l) => !l)}
            onToggleMute={toggleMute}
            onToggleFullscreen={toggleFullscreen}
            onToggleProxy={() => setUseProxy((v) => !v)}
          />

          {!inspectorCollapsed ? (
            <div
              className="panel-resizer"
              title="Drag to resize inspector"
              onPointerDown={(e) => startPanelResize("inspector", e.clientX)}
            />
          ) : (
            <div className="panel-resizer inert" aria-hidden />
          )}

          <StudioInspector
            tab={tab}
            onTab={setTab}
            error={error}
            resultDownloadUrl={result?.downloadUrl}
            exportFormat={exportOpts.format}
            exportJobs={exportJobs}
            inspSearch={inspSearch}
            onInspSearch={setInspSearch}
            collapsed={inspectorCollapsed}
            onToggleCollapsed={() => setInspectorCollapsed((v) => !v)}
            onRefreshJobs={refreshExportJobs}
            onClearFinishedJobs={() =>
              setExportJobs((prev) =>
                prev.filter((j) => j.status === "queued" || j.status === "running"),
              )
            }
            onCancelJob={async (jobId) => {
              await fetch(
                `/api/editor/project/${project.id}/export?jobId=${encodeURIComponent(jobId)}`,
                { method: "DELETE" },
              );
            }}
          >
            <InspectorTabPanels ctx={panelCtx} />
          </StudioInspector>
        </div>

        {/* Timeline */}
        <StudioTimeline
          ctx={{
            expanded,
            setExpanded,
            total,
            scrubTotal,
            current,
            fmt,
            snapEnabled,
            setSnapEnabled,
            magnetic,
            setMagnetic,
            freeV1,
            onToggleFreeV1: () => {
              setFreeV1((on) => {
                const next = !on;
                if (next) {
                  setViewClips((prev) => {
                    const { starts: packed } = computeTimeline(prev, { freeMain: false });
                    return prev.map((c, i) =>
                      clipLane(c) === 0 ? { ...c, tlStart: packed[i] ?? 0 } : c,
                    );
                  });
                  pushToast("V1 free-place on — drag clips freely", "info");
                } else {
                  setViewClips((prev) =>
                    prev.map((c) =>
                      clipLane(c) === 0 ? { ...c, tlStart: undefined } : c,
                    ),
                  );
                  pushToast("V1 packed gapless", "info");
                }
                return next;
              });
            },
            rippleEnabled,
            setRippleEnabled,
            pxPerSec,
            setPxPerSec,
            rate,
            onSetRate: setRate,
            trackRef,
            setViewScroll,
            timelineWidth,
            minorTicks,
            ticks,
            snapSec,
            timeFromClientX,
            seek,
            splitAtPlayhead,
            splitClipAt,
            tool: editTool,
            slipClip,
            slideClip,
            trimClipEdge,
            tracks,
            patchTrack,
            clips: viewClips,
            starts,
            marquee,
            setMarquee,
            selectedIds,
            setSelectedIds,
            setSelectedId,
            selectedTextId,
            setSelectedTextId,
            setTab: (t) => {
              if (t === "text") {
                setTab("text");
                return;
              }
              if (t === "transitions") {
                setTab("transitions");
                return;
              }
              if (t === "fx") {
                setSidebarTab("effects");
                setTab("effects");
                return;
              }
              if (t === "effects") {
                setTab("color");
                return;
              }
              if (t === "audio") {
                setTab("audio");
                return;
              }
              setTab(t);
            },
            pushToast,
            clipInView,
            assetById,
            selectClip,
            setCtxMenu,
            reorderTo,
            thumbUrl,
            waveformUrl,
            moveKeyframe,
            dragHandle,
            patchClip,
            beginMagneticDrag,
            endMagneticDrag,
            rippleMagneticWhileDrag,
            music: nestedEditing ? null : music,
            musicAsset: nestedEditing ? undefined : musicAsset,
            patchMusic,
            musicTracks: nestedEditing ? [] : musicTracks,
            patchMusicTrack,
            removeMusicTrack,
            markers: nestedEditing ? [] : markers,
            onSeekMarker: seek,
            texts: nestedEditing ? [] : texts,
            patchText,
            nestDepth: nestPath.length,
            onExitCompound: exitCompound,
            onEnterCompound: enterCompound,
            playing,
            muted,
            masterVolume,
            useProxy,
            guidesThirds: guides.thirds,
            onTogglePlay: togglePlay,
            onToggleMute: toggleMute,
            onMasterVolume: setMasterVolume,
            onToggleProxy: () => setUseProxy((v) => !v),
            onToggleGuides: () =>
              setGuides((g) => ({ ...g, thirds: !g.thirds })),
            onTransitionJunction,
            onDeleteSelection: () => {
              if (selectedTextId) deleteText(selectedTextId);
              else if (selectedId) deleteClip(selectedId);
            },
            canDeleteSelection: Boolean(selectedId || selectedTextId),
          }}
        />

        {/* Status bar */}
        <StudioStatusBar
          clipCount={viewClips.length}
          selectedCount={selectedIds.length}
          textCount={texts.length}
          hasMusic={(Boolean(music) || musicTracks.length > 0) && !nestedEditing}
          saving={saving}
          lastSavedAt={lastSavedAt}
          aspect={aspect}
          fps={FPS}
          pxPerSec={pxPerSec}
          current={current}
          total={total}
          fmt={fmt}
          tool={editTool}
          workspace={workspace}
          useProxy={useProxy}
          playing={playing}
          snap={snapEnabled}
          magnetic={magnetic}
          ripple={rippleEnabled}
        />

        {cmdOpen && (
          <CommandPalette
            open={cmdOpen}
            onClose={() => setCmdOpen(false)}
            commands={studioCommands}
          />
        )}

        {historyOpen && (
          <UndoHistoryPanel
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            entries={historyEntries}
            onJump={(i) => {
              jumpHistory(i);
              setHistoryOpen(false);
            }}
          />
        )}


        {/* Toasts */}
        <div className="studio-toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.msg}
            </div>
          ))}
        </div>

        {/* Clip context menu */}
        {ctxMenu && (
          <ClipContextMenu
            menu={ctxMenu}
            clips={viewClips}
            starts={starts}
            music={nestedEditing ? null : music}
            onClose={() => setCtxMenu(null)}
            onSeek={seek}
            onSplitAtPlayhead={splitAtPlayhead}
            onDuplicate={duplicateClip}
            onCopy={copySelection}
            onAddOpacityKeyframe={(id) => addKeyframe(id, "opacity")}
            onDetachAudio={detachClipAudio}
            onRelinkAudio={relinkClipAudio}
            onMoveToLane={moveClipToLane}
            onDelete={deleteClip}
            selectedIds={selectedIds}
            onCreateCompound={createCompoundFromSelection}
            onExplodeCompound={explodeCompound}
            onEditCompound={enterCompound}
            onCreateMulticam={createMulticamFromSelection}
            onSetMulticamActive={setMulticamActive}
          />
        )}

        {/* Export window */}
        {showExport && (
          <ExportDialog
            options={exportOpts}
            setOptions={setExportOpts}
            duration={total}
            aspect={aspect}
            onCancel={() => setShowExport(false)}
            onConfirm={exportVideo}
            onOpenGrowthHub={() => {
              setShowExport(false);
              setShowGrowthHub(true);
            }}
          />
        )}

        {showGrowthHub && (
        <GrowthHub
          open={showGrowthHub}
          onClose={() => setShowGrowthHub(false)}
          projectId={project.id}
          duration={total}
          videoTitle={project.name}
          transcriptSnippet={texts
            .filter((t) => textHasContent(t))
            .map((t) => t.text)
            .join(" ")}
          initialScore={viralScore}
          initialPack={growthPack}
          brandKit={brandKit}
          calendarEvents={calendarEvents}
          reviewComments={reviewComments}
          exportJobs={exportJobs}
          logoAssets={assets
            .filter((a) => a.kind === "image")
            .map((a) => ({
              id: a.id,
              name: a.name,
              url: `/api/editor/project/${project.id}/asset/${encodeURIComponent(a.filename)}`,
            }))}
          exportHistoryCount={exportJobs.filter((j) => j.status === "done").length}
          onSavePack={savePack}
          onSchedule={scheduleEvent}
          onUpsertCalendarEvent={upsertCalendarEvent}
          onDeleteCalendarEvent={deleteCalendarEvent}
          onSyncCalendarFromJobs={syncCalendarFromJobs}
          onBrandKit={saveBrandKit}
          onApplyBrandKit={applyBrandKitToTimeline}
          onGenerateThumb={generateGrowthThumb}
          onBatchExport={batchExportAspects}
          onHookFix={applyHookFix}
          onApplyChapters={applyChaptersAsMarkers}
          onApplyTranslation={applyTranslationCaptions}
          onApplyDubTracks={applyDubTracks}
          onCloudPull={hydrateFromCloudProject}
          onCreateShareLink={createShareLink}
          onRunAnalyze={() => void runAiAnalyze()}
          onRecommendationAction={handleRecommendationAction}
        />
        )}

        {showKeymap && (
          <KeymapDialog
            keymap={keymap}
            setKeymap={setKeymap}
            onClose={() => setShowKeymap(false)}
            pushToast={pushToast}
          />
        )}
        {showManual && <StudioManual onClose={() => setShowManual(false)} />}
      </div>
    </div>
  );
}
