"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AspectRatio } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import {
  clipLength,
  clipLane,
  clipSourceLength,
  defaultClip,
  defaultEffect,
  defaultText,
  DEFAULT_EXPORT,
  DEFAULT_TRACKS,
  DEFAULT_TRANSFORM,
  DEFAULT_COLOR,
  EFFECT_DEFS,
  DEFAULT_BEZIER,
  sampleKeyframe,
  textHasContent,
  TEXT_TEMPLATES,
  type BezierHandles,
  type ClipEffect,
  type ClipKeyframe,
  type ClipLayer,
  type ClipTransform,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type ColorGrade,
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
import {
  replaceClipWithRamp,
  speedRampLabel,
  type SpeedRampKind,
} from "@/lib/speed-ramp";
import {
  activeMainIndex,
  collectSnapPoints,
  computeTimeline,
  snapToPoints,
} from "@/lib/studio-timeline";
import { ExportDialog } from "@/components/editor/ExportDialog";
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
  TransitionLibrary,
} from "@/components/editor/library/CapCutLibraries";
import { TemplateLibrary } from "@/components/editor/library/TemplateLibrary";
import { CommandPalette, type CommandItem } from "@/components/editor/CommandPalette";
import { UndoHistoryPanel } from "@/components/editor/UndoHistoryPanel";
import { StudioStatusBar } from "@/components/editor/StudioStatusBar";
import { ClipContextMenu } from "@/components/editor/ClipContextMenu";
import { KeymapDialog } from "@/components/editor/KeymapDialog";
import { StudioManual } from "@/components/editor/StudioManual";
import { AiAssistantPanel } from "@/components/editor/ai/AiAssistantPanel";
import { TranscriptPanel } from "@/components/editor/ai/TranscriptPanel";
import {
  applyEditResultToClip,
  captionColorForSpeaker,
  parseEditPrompt,
} from "@/lib/ai-edit-prompt";
import { GrowthHub } from "@/components/editor/growth/GrowthHub";
import { GrowthShellPanel } from "@/components/editor/growth/GrowthShellPanel";
import { AI_MARKER_META, type AiSuggestion, type BrandKit, type CalendarEvent, type GrowthPack, type HookFixId, type ViralScorecard } from "@/lib/growth-types";
import { parseChapterLine, formatYoutubeChaptersBlock } from "@/lib/growth-chapters";
import type { DubTrackPiece } from "@/lib/platform-types";
import type { ShellCard } from "@/lib/capcut-catalog";

/** Timeline frame rate — matches the export renderer (editor-render FPS). */
const FPS = 30;

type Snapshot = {
  clips: TimelineClip[];
  texts: TextOverlay[];
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  tracks: Record<TrackId, TrackChrome>;
  freeV1: boolean;
  markers: TimelineMarker[];
};

type Toast = { id: string; msg: string; kind: "info" | "success" | "error" };

type ContextMenu = {
  x: number;
  y: number;
  clipId: string;
} | null;

const FAV_KEY = "clippers.fav.transitions";

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
}

function uid(p: string) {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** One ripple-trim pass over main-lane clips. Returns same array if nothing removed. */
function applyRippleTrimOnce(
  prev: TimelineClip[],
  start: number,
  end: number,
  freeMain: boolean,
): TimelineClip[] {
  if (end - start < 0.15) return prev;
  const { starts: st } = computeTimeline(prev, { freeMain });
  const next: TimelineClip[] = [];
  let removed = 0;
  for (let i = 0; i < prev.length; i++) {
    const c = prev[i];
    if (clipLane(c) !== 0) {
      next.push(c);
      continue;
    }
    const a = st[i] ?? 0;
    const len = clipLength(c);
    const b = a + len;
    const speed = c.speed || 1;
    if (b <= start + 0.01 || a >= end - 0.01) {
      next.push(c);
      continue;
    }
    if (a >= start - 0.01 && b <= end + 0.01) {
      removed++;
      continue;
    }
    if (a < start && b > start) {
      const cutSrc = c.inPoint + (start - a) * speed;
      next.push({
        ...c,
        id: uid("clip"),
        outPoint: Math.min(cutSrc, c.outPoint - 0.05),
      });
      removed++;
    }
    if (a < end && b > end) {
      const cutSrc = c.inPoint + (end - a) * speed;
      const right: TimelineClip = {
        ...c,
        id: uid("clip"),
        inPoint: Math.max(cutSrc, c.inPoint + 0.05),
        transition: "none",
      };
      if (freeMain) right.tlStart = end;
      next.push(right);
      removed++;
    }
  }
  return removed ? next : prev;
}

/** Clips visible at a compound nest path (empty path = root timeline). */
function getClipsAtPath(root: TimelineClip[], path: string[]): TimelineClip[] {
  let nodes = root;
  for (const id of path) {
    const parent = nodes.find((c) => c.id === id);
    if (!parent?.children?.length) return [];
    nodes = parent.children;
  }
  return nodes;
}

/** Replace the clip list at nest path; syncs compound outPoint when writing children. */
function updateClipsAtPath(
  root: TimelineClip[],
  path: string[],
  nextChildren: TimelineClip[],
): TimelineClip[] {
  if (path.length === 0) return nextChildren;
  const [head, ...rest] = path;
  return root.map((c) => {
    if (c.id !== head) return c;
    if (rest.length === 0) {
      return {
        ...c,
        children: nextChildren,
        outPoint: Math.max(
          0.1,
          nextChildren.reduce((s, x) => s + clipLength(x), 0),
        ),
      };
    }
    return {
      ...c,
      children: updateClipsAtPath(c.children || [], rest, nextChildren),
    };
  });
}

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

  // Phase 32 — process due scheduled publishes while Studio is open
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        await fetch("/api/publish/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "process" }),
        });
      } catch {
        // ignore
      }
    }
    void tick();
    const id = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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
  const [historyTick, setHistoryTick] = useState(0);
  const [marquee, setMarquee] = useState<{
    x0: number;
    x1: number;
  } | null>(null);

  function startPanelResize(
    which: "bin" | "inspector",
    clientX0: number,
  ) {
    const base = which === "bin" ? binW : inspectorW;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - clientX0;
      if (which === "bin") setBinW(clamp(base + dx, 160, 360));
      else setInspectorW(clamp(base - dx, 220, 440));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
  const [favTr, setFavTr] = useState<TransitionKind[]>([]);
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

  function applyWorkspace(w: WorkspaceId) {
    setWorkspace(w);
    if (w === "editing") {
      setBinW(220);
      setInspectorW(320);
      setFloatBin(false);
      setFloatInspector(false);
      setExpanded(true);
      setSidebarTab("media");
      setTab("clip");
      setSidebarCollapsed(false);
      setInspectorCollapsed(false);
    } else if (w === "color") {
      setBinW(180);
      setInspectorW(400);
      setFloatBin(false);
      setFloatInspector(false);
      setSidebarTab("effects");
      setTab("color");
      setInspectorCollapsed(false);
    } else if (w === "audio") {
      setBinW(200);
      setInspectorW(340);
      setExpanded(true);
      setSidebarTab("media");
      setTab("audio");
      setInspectorCollapsed(false);
    } else if (w === "deliver") {
      setBinW(160);
      setInspectorW(280);
      setShowExport(true);
      setShowGrowthHub(true);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavTr(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const toggleFav = useCallback((id: TransitionKind) => {
    setFavTr((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
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
  const [favAssets, setFavAssets] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("clippers.fav.assets") || "[]");
    } catch {
      return [];
    }
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(project.updatedAt || null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(true);
  const savingRef = useRef(false);

  // Transition preview panel
  const [previewTransition, setPreviewTransition] = useState<TransitionKind>("crossfade");
  const [demoKey, setDemoKey] = useState(0);

  // Pro preview controls (Phase 2)
  const [rate, setRate] = useState(1); // master playback rate
  const [dir, setDir] = useState<1 | -1>(1); // 1 forward, -1 reverse
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [guides, setGuides] = useState({ thirds: false, safe: false, center: false });
  /** Prefer low-res proxies in the preview monitor when available. */
  const [useProxy, setUseProxy] = useState(true);

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

  // Undo / redo history (Phase 12)
  const historyRef = useRef<{ stack: Snapshot[]; index: number; applying: boolean }>({
    stack: [],
    index: -1,
    applying: false,
  });
  const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });

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

  // ---------- undo / redo history ----------
  // Records a snapshot whenever the editable project state settles (debounced).
  useEffect(() => {
    const h = historyRef.current;
    if (h.applying) {
      h.applying = false;
      return;
    }
    const snap: Snapshot = {
      clips: JSON.parse(JSON.stringify(clips)),
      texts: JSON.parse(JSON.stringify(texts)),
      music: music ? JSON.parse(JSON.stringify(music)) : null,
      musicTracks: JSON.parse(JSON.stringify(musicTracks)),
      tracks: JSON.parse(JSON.stringify(tracks)),
      freeV1,
      markers: JSON.parse(JSON.stringify(markers)),
    };
    const t = setTimeout(() => {
      const cur = h.stack[h.index];
      if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return;
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > 100) h.stack.shift();
      h.index = h.stack.length - 1;
      setHistoryInfo({ canUndo: h.index > 0, canRedo: false });
      setHistoryTick((n) => n + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [clips, texts, music, musicTracks, tracks, freeV1, markers]);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const h = historyRef.current;
    h.applying = true;
    setClips(JSON.parse(JSON.stringify(snap.clips)));
    setTexts(JSON.parse(JSON.stringify(snap.texts)));
    setMusic(snap.music ? JSON.parse(JSON.stringify(snap.music)) : null);
    setMusicTracks(JSON.parse(JSON.stringify(snap.musicTracks || [])));
    if (snap.tracks) setTracks(JSON.parse(JSON.stringify(snap.tracks)));
    if (typeof snap.freeV1 === "boolean") setFreeV1(snap.freeV1);
    if (snap.markers) setMarkers(JSON.parse(JSON.stringify(snap.markers)));
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index]);
    setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    setHistoryTick((n) => n + 1);
    pushToast("Undo", "info");
  }, [applySnapshot, pushToast]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index]);
    setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    setHistoryTick((n) => n + 1);
    pushToast("Redo", "info");
  }, [applySnapshot, pushToast]);

  const jumpHistory = useCallback(
    (index: number) => {
      const h = historyRef.current;
      if (index < 0 || index >= h.stack.length) return;
      h.index = index;
      applySnapshot(h.stack[h.index]);
      setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
      setHistoryTick((n) => n + 1);
    },
    [applySnapshot],
  );

  const historyEntries = useMemo(() => {
    void historyTick;
    const h = historyRef.current;
    return h.stack.map((_, i) => ({
      index: i,
      label: i === 0 ? "Project opened" : `Edit ${i}`,
      current: i === h.index,
    }));
  }, [historyTick, clips, texts, music, markers]);

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

  function toggleFavAsset(id: string) {
    setFavAssets((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("clippers.fav.assets", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function renameMediaAsset(asset: ProjectAsset) {
    const name = window.prompt("Rename media", asset.name);
    if (name == null || !name.trim() || name.trim() === asset.name) return;
    try {
      const res = await fetch(`/api/editor/project/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      setAssets((data.project as Project).assets);
      pushToast("Renamed", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Rename failed", "error");
    }
  }

  async function deleteMediaAsset(asset: ProjectAsset) {
    const used =
      clips.some((c) => c.assetId === asset.id) ||
      music?.assetId === asset.id ||
      musicTracks.some((m) => m.assetId === asset.id) ||
      clips.some((c) => c.color.lut === asset.filename);
    if (used && !window.confirm("This media is used. Delete anyway?")) return;
    try {
      const res = await fetch(
        `/api/editor/project/${project.id}/asset?assetId=${encodeURIComponent(asset.id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setAssets((data.project as Project).assets);
      pushToast("Deleted media", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  async function replaceMediaAsset(asset: ProjectAsset, file: File) {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("replaceId", asset.id);
      const res = await fetch(`/api/editor/project/${project.id}/asset`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Replace failed");
      if (data.project) setAssets((data.project as Project).assets);
      else {
        setAssets((prev) => prev.map((a) => (a.id === asset.id ? (data.asset as ProjectAsset) : a)));
      }
      pushToast("Media replaced", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Replace failed", "error");
    }
  }

  async function generateProxy(asset: ProjectAsset) {
    if (asset.kind !== "video" && asset.kind !== "image") {
      pushToast("Proxies are for video/image only", "info");
      return;
    }
    pushToast(asset.proxyFile ? "Rebuilding proxy…" : "Generating proxy…", "info");
    try {
      const res = await fetch(`/api/editor/project/${project.id}/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Proxy failed");
      setAssets((data.project as Project).assets);
      pushToast("Proxy ready — preview uses low-res", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Proxy failed", "error");
    }
  }

  async function generateProxiesBatch() {
    const need = assets.filter(
      (a) => (a.kind === "video" || a.kind === "image") && !a.proxyFile,
    );
    if (!need.length) {
      pushToast("All media already has proxies", "info");
      return;
    }
    pushToast(`Building ${need.length} proxies…`, "info");
    let ok = 0;
    for (const asset of need) {
      try {
        const res = await fetch(`/api/editor/project/${project.id}/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: asset.id }),
        });
        const data = await res.json();
        if (!res.ok) continue;
        setAssets((data.project as Project).assets);
        ok += 1;
      } catch {
        // continue batch
      }
    }
    pushToast(`Proxies ready: ${ok}/${need.length}`, ok ? "success" : "error");
  }

  async function cleanupUnusedMedia() {
    try {
      await saveProjectState(true);
      const res = await fetch(`/api/editor/project/${project.id}/cleanup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");
      setAssets((data.project as Project).assets);
      pushToast(`Removed ${data.removed} unused`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Cleanup failed", "error");
    }
  }

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
      .filter((r) => clipLane(r.c) === 0 && !r.c.adjustment);
    for (let k = 0; k < mains.length - 1; k++) {
      const a = mains[k];
      const b = mains[k + 1];
      const kind = a.c.transition;
      if (!kind || kind === "none") continue;
      const dur = Math.max(0.08, a.c.transitionDuration || 0.5);
      const end = a.s + clipLength(a.c);
      const t0 = end - dur;
      if (current < t0 || current > end + 0.02) continue;
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

  function addKeyframe(id: string, prop: KeyframeProp) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip || activeIndex < 0 || viewClips[activeIndex]?.id !== id) {
      pushToast("Scrub onto the clip, then add a keyframe", "info");
      return;
    }
    const len = clipLength(clip);
    const local = clamp(current - (starts[activeIndex] || 0), 0, len);
    const t = len > 0 ? local / len : 0;
    const tr = { ...DEFAULT_TRANSFORM, ...(clip.transform || {}) };
    const valueMap: Record<KeyframeProp, number> = {
      opacity: tr.opacity,
      volume: clip.volume,
      x: tr.x,
      y: tr.y,
      scaleX: tr.scaleX,
      scaleY: tr.scaleY,
      rotation: tr.rotation,
      brightness: clip.color.brightness,
    };
    const keys = [...(clip.keyframes || [])];
    // Replace nearby keyframe within 2%
    const near = keys.findIndex((k) => Math.abs(k.t - t) < 0.02);
    const kf: ClipKeyframe = {
      id: near >= 0 ? keys[near].id : uid("kf"),
      t,
      [prop]: valueMap[prop],
      ease: defaultEase,
      bezier: defaultEase === "bezier" ? ([...defaultBezier] as BezierHandles) : undefined,
    };
    if (near >= 0) keys[near] = { ...keys[near], ...kf };
    else keys.push(kf);
    keys.sort((a, b) => a.t - b.t);
    patchClip(id, { keyframes: keys });
    pushToast(`${prop} keyframe (${defaultEase})`, "success");
  }

  function setAllKeyframeEase(
    id: string,
    ease: KeyframeEase,
    bezier?: BezierHandles,
    quiet = false,
  ) {
    const clip = viewClips.find((c) => c.id === id);
    const bez = bezier || defaultBezier;
    setDefaultEase(ease);
    if (bezier) setDefaultBezier(bezier);
    if (!clip?.keyframes?.length) return;
    patchClip(id, {
      keyframes: clip.keyframes.map((k) => ({
        ...k,
        ease,
        bezier: ease === "bezier" ? ([...bez] as BezierHandles) : undefined,
      })),
    });
    if (!quiet) pushToast(`Ease → ${ease}`, "success");
  }

  function clipInView(leftPx: number, widthPx: number) {
    const pad = 240;
    return leftPx + widthPx > viewScroll.left - pad && leftPx < viewScroll.left + viewScroll.width + pad;
  }

  function removeNearbyKeyframe(id: string) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip || activeIndex < 0) return;
    const len = clipLength(clip);
    const t = len > 0 ? clamp(current - (starts[activeIndex] || 0), 0, len) / len : 0;
    const keys = (clip.keyframes || []).filter((k) => Math.abs(k.t - t) > 0.02);
    patchClip(id, { keyframes: keys });
  }

  function moveKeyframe(clipId: string, kfId: string, nextT: number) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip) return;
    const keys = (clip.keyframes || []).map((k) =>
      k.id === kfId ? { ...k, t: clamp(nextT, 0, 1) } : k,
    );
    keys.sort((a, b) => a.t - b.t);
    patchClip(clipId, { keyframes: keys });
  }

  function copyKeyframes(clipId: string) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip?.keyframes?.length) {
      pushToast("No keyframes to copy", "info");
      return;
    }
    kfClipboardRef.current = JSON.parse(JSON.stringify(clip.keyframes));
    pushToast("Keyframes copied", "success");
  }

  function pasteKeyframes(clipId: string) {
    if (!kfClipboardRef.current?.length) {
      pushToast("No keyframes on clipboard", "info");
      return;
    }
    const pasted = kfClipboardRef.current.map((k) => ({
      ...k,
      id: uid("kf"),
    }));
    patchClip(clipId, { keyframes: pasted });
    pushToast("Keyframes pasted", "success");
  }

  // ---------- media loading / seeking ----------
  useEffect(() => {
    const v = videoRef.current;
    if (!activeClip || !activeAsset || !v) return;
    const speed = activeClip.speed || 1;
    const sync = activeClip.multicamSync ?? 0;
    const sourceTime = activeClip.inPoint + sync + activeLocalT * speed;

    if (activeAsset.kind === "video") {
      const url = assetUrl(activeAsset);
      const mediaKey = `${activeAsset.id}:${url}`;
      // Keep element src in sync (JSX also sets src; this covers proxy swaps).
      if (activeAssetRef.current !== mediaKey) {
        activeAssetRef.current = mediaKey;
        if (!v.src.endsWith(encodeURIComponent(activeAsset.proxyFile || activeAsset.filename)) &&
            !v.src.includes(activeAsset.filename)) {
          v.src = url;
        }
        const onReady = () => {
          try {
            v.currentTime = Math.max(0, sourceTime);
          } catch {
            /* ignore seek before ready */
          }
          v.playbackRate = speed;
          if (playing) v.play().catch(() => {});
          v.removeEventListener("loadeddata", onReady);
        };
        v.addEventListener("loadeddata", onReady);
        if (v.readyState >= 2) onReady();
      } else {
        if (Math.abs(v.currentTime - sourceTime) > 0.25) {
          try {
            v.currentTime = Math.max(0, sourceTime);
          } catch {
            /* ignore */
          }
        }
        v.playbackRate = speed;
        if (playing && v.paused) v.play().catch(() => {});
      }
      v.volume = clamp(activeClip.volume, 0, 1);
    } else {
      activeAssetRef.current = null;
      v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeAsset?.id, activeClip?.id, activeLocalT, playing, useProxy, assetUrl]);

  // keep playbackRate live when speed changes
  useEffect(() => {
    const v = videoRef.current;
    if (v && activeClip) v.playbackRate = activeClip.speed || 1;
  }, [activeClip?.speed, activeClip]);

  // ---------- master playback clock ----------
  const musicGain = useCallback(
    (t: number) => {
      if (!music) return 0;
      if (mixerSolo && mixerSolo !== "music") return 0;
      const span = Math.max(0.1, music.outPoint - music.inPoint);
      const local = t - music.start;
      if (local < 0 || local > span) return 0;
      let g = clamp(music.volume, 0, 1);
      if (music.fadeIn > 0 && local < music.fadeIn) g *= local / music.fadeIn;
      if (music.fadeOut > 0 && local > span - music.fadeOut)
        g *= Math.max(0, (span - local) / music.fadeOut);
      return clamp(g, 0, 1);
    },
    [music, mixerSolo],
  );

  const sfxGain = useCallback(
    (mt: MusicTrack, t: number, soloId: string) => {
      if (mixerSolo && mixerSolo !== soloId) return 0;
      const span = Math.max(0.1, mt.outPoint - mt.inPoint);
      const local = t - mt.start;
      if (local < 0 || local > span) return 0;
      let g = clamp(mt.volume, 0, 1);
      if (mt.fadeIn > 0 && local < mt.fadeIn) g *= local / mt.fadeIn;
      if (mt.fadeOut > 0 && local > span - mt.fadeOut)
        g *= Math.max(0, (span - local) / mt.fadeOut);
      return clamp(g, 0, 1);
    },
    [mixerSolo],
  );

  const syncMusic = useCallback(
    (t: number, isPlaying: boolean) => {
      const m = musicRef.current;
      if (!m || !music) return;
      const span = Math.max(0.1, music.outPoint - music.inPoint);
      const inWindow = t >= music.start && t <= music.start + span;
      m.volume = musicGain(t);
      if (isPlaying && inWindow && musicGain(t) > 0.001) {
        const local = music.inPoint + (t - music.start);
        if (Math.abs(m.currentTime - local) > 0.3) m.currentTime = local;
        if (m.paused) m.play().catch(() => {});
      } else if (!m.paused) {
        m.pause();
      }
    },
    [music, musicGain],
  );

  const syncSfx = useCallback(
    (t: number, isPlaying: boolean) => {
      musicTracks.forEach((mt, i) => {
        const el = sfxRefs.current[i];
        if (!el) return;
        const soloId = `sfx-${i}`;
        const g = sfxGain(mt, t, soloId);
        const span = Math.max(0.1, mt.outPoint - mt.inPoint);
        const inWindow = t >= mt.start && t <= mt.start + span;
        el.volume = g;
        if (isPlaying && inWindow && g > 0.001 && !tracks.music.muted && !muted) {
          const local = mt.inPoint + (t - mt.start);
          if (Math.abs(el.currentTime - local) > 0.3) el.currentTime = local;
          if (el.paused) el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      });
    },
    [musicTracks, sfxGain, tracks.music.muted, muted],
  );

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      videoRef.current?.pause();
      musicRef.current?.pause();
      sfxRefs.current.forEach((a) => a?.pause());
      return;
    }
    lastTickRef.current = performance.now();
    const v = videoRef.current;
    if (v) {
      v.muted = muted || tracks.video.muted || (mixerSolo !== null && mixerSolo !== "clip");
      if (activeAsset?.kind === "video" && dir === 1) v.play().catch(() => {});
      else v.pause();
    }

    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const prev = curRef.current;
      let idx = 0;
      for (let i = 0; i < viewClips.length; i++) {
        if (starts[i] <= prev + 0.0001) idx = i;
        else break;
      }
      const clip = viewClips[idx];
      let next = prev;
      if (clip) {
        const asset = assetById.get(clip.assetId);
        const clipStart = starts[idx] ?? 0;
        const speed = clip.speed || 1;
        if (asset?.kind === "video" && videoRef.current && dir === 1) {
          const vv = videoRef.current;
          vv.playbackRate = clamp(speed * rate, 0.0625, 16);
          vv.muted = muted;
          const st = vv.currentTime;
          if (vv.ended || st >= clip.outPoint - 0.03) {
            next = clipStart + clipLength(clip);
          } else if (vv.readyState >= 2) {
            next = clipStart + (st - clip.inPoint) / speed;
          }
        } else {
          // reverse playback (scrub) or image / silent clip
          next = prev + dir * dt * rate;
          const vv = videoRef.current;
          if (asset?.kind === "video" && vv) {
            vv.pause();
            const local = clamp(next, clipStart, clipStart + clipLength(clip));
            const stt = Math.max(0, clip.inPoint + (local - clipStart) * speed);
            if (Math.abs(vv.currentTime - stt) > 0.05) vv.currentTime = stt;
          }
        }
      }

      if (dir === 1 && next >= total - 0.02) {
        if (loop) {
          next = 0;
          const vv = videoRef.current;
          const c0 = viewClips[0];
          if (vv && c0 && assetById.get(c0.assetId)?.kind === "video") {
            vv.currentTime = Math.max(0, c0.inPoint);
          }
        } else {
          curRef.current = total;
          setCurrent(total);
          syncMusic(total, false);
          syncSfx(total, false);
          setPlaying(false);
          return;
        }
      }
      if (dir === -1 && next <= 0) {
        curRef.current = 0;
        setCurrent(0);
        syncMusic(0, false);
        syncSfx(0, false);
        setPlaying(false);
        setDir(1);
        return;
      }

      curRef.current = next;
      setCurrent(next);
      // Live volume keyframes on the active video clip
      if (clip && videoRef.current && assetById.get(clip.assetId)?.kind === "video") {
        const len = clipLength(clip);
        const u = len > 0 ? clamp((next - (starts[idx] || 0)) / len, 0, 1) : 0;
        const vol = sampleKeyframe(clip.keyframes, "volume", u, clip.volume);
        videoRef.current.volume = clamp(vol, 0, 1);
        videoRef.current.muted =
          muted ||
          tracks.video.muted ||
          (mixerSolo !== null && mixerSolo !== "clip");
      }
      syncMusic(next, !nestedEditing && dir === 1 && !muted && !tracks.music.muted);
      syncSfx(next, !nestedEditing && dir === 1 && !muted && !tracks.music.muted);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, viewClips, starts, total, music, rate, dir, loop, muted, tracks.music.muted, tracks.video.muted, nestedEditing]);

  function togglePlay() {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first — click media in the library", "info");
      return;
    }
    setDir(1);
    if (curRef.current >= total - 0.02) {
      curRef.current = 0;
      setCurrent(0);
    }
    const next = !playing;
    setPlaying(next);
    const v = videoRef.current;
    if (v && activeAsset?.kind === "video") {
      if (next) {
        // Call play() inside the click handler so the browser allows unmuted playback.
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      } else {
        v.pause();
      }
    }
  }

  // J / K / L transport
  function playForward() {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first", "info");
      return;
    }
    if (playing && dir === 1) {
      setRate((r) => (r >= 2 ? 2 : r >= 1.5 ? 2 : r >= 1 ? 1.5 : 1));
    } else {
      setDir(1);
      setRate(1);
      if (curRef.current >= total - 0.02) {
        curRef.current = 0;
        setCurrent(0);
      }
      setPlaying(true);
      const v = videoRef.current;
      if (v && activeAsset?.kind === "video") {
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      }
    }
  }
  function playReverse() {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first", "info");
      return;
    }
    if (playing && dir === -1) {
      setRate((r) => Math.min(4, r + 0.5));
    } else {
      setDir(-1);
      setRate(1);
      setPlaying(true);
    }
  }
  function stopPlayback() {
    setPlaying(false);
    setRate(1);
    setDir(1);
    musicRef.current?.pause();
    sfxRefs.current.forEach((a) => a?.pause());
  }

  const stepFrame = (frames: number) => seek(curRef.current + frames / FPS);

  function toggleMute() {
    setMuted((m) => {
      const nv = !m;
      if (videoRef.current) videoRef.current.muted = nv;
      pushToast(nv ? "Muted" : "Unmuted", "info");
      return nv;
    });
  }

  function toggleFullscreen() {
    const el = previewWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }

  // ---------- clipboard (Phase 14) ----------
  function copySelection() {
    if (selectedText) {
      clipboardRef.current = { type: "text", data: JSON.parse(JSON.stringify(selectedText)) };
      pushToast("Text copied", "success");
    } else if (selectedClip) {
      clipboardRef.current = { type: "clip", data: JSON.parse(JSON.stringify(selectedClip)) };
      pushToast("Clip copied", "success");
    }
  }
  function cutSelection() {
    if (!selectedText && !selectedClip) return;
    copySelection();
    if (selectedTextId) deleteText(selectedTextId);
    else if (selectedId) deleteClip(selectedId);
  }
  function pasteClipboard() {
    const c = clipboardRef.current;
    if (!c) return;
    if (c.type === "clip") {
      const copy: TimelineClip = { ...c.data, id: uid("clip"), color: { ...c.data.color } };
      setViewClips((prev) => {
        const i = prev.findIndex((x) => x.id === selectedId);
        const idx = i >= 0 ? i + 1 : prev.length;
        const n = [...prev];
        n.splice(idx, 0, copy);
        return n;
      });
      setSelectedId(copy.id);
      pushToast("Clip pasted", "success");
    } else {
      const copy: TextOverlay = { ...c.data, id: uid("txt"), start: curRef.current };
      setTexts((prev) => [...prev, copy]);
      setSelectedTextId(copy.id);
      pushToast("Text pasted", "success");
    }
  }
  function duplicateSelection() {
    if (selectedTextId) {
      const t = texts.find((x) => x.id === selectedTextId);
      if (t) {
        const copy: TextOverlay = { ...t, id: uid("txt"), start: t.start + t.duration };
        setTexts((prev) => [...prev, copy]);
        setSelectedTextId(copy.id);
      }
    } else if (selectedId) {
      duplicateClip(selectedId);
    }
  }

  function seek(t: number) {
    const clamped = clamp(t, 0, scrubTotal);
    curRef.current = clamped;
    setCurrent(clamped);
    const v = videoRef.current;
    if (v && activeAsset?.kind === "video") {
      const clipStart = starts[activeIndex] ?? 0;
      const clip = viewClips[activeIndex];
      if (clip) v.currentTime = Math.max(0, clip.inPoint + (clamped - clipStart) * (clip.speed || 1));
    }
    syncMusic(clamped, playing);
    syncSfx(clamped, playing);
  }

  // ---------- clip ops ----------
  function patchClip(id: string, patch: Partial<TimelineClip>) {
    setViewClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function applySpeedRamp(clipId: string, kind: SpeedRampKind) {
    setViewClips((prev) => {
      const next = replaceClipWithRamp(prev, clipId, kind);
      if (!next) return prev;
      const added = next.filter((c) => !prev.some((p) => p.id === c.id));
      const pick = added[0]?.id;
      if (pick) queueMicrotask(() => setSelectedId(pick));
      return next;
    });
    pushToast(speedRampLabel(kind), "success");
  }

  function patchColor(id: string, patch: Partial<TimelineClip["color"]>) {
    setViewClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, color: { ...c.color, ...patch } } : c)),
    );
  }
  function patchTransform(id: string, patch: Partial<ClipTransform>) {
    setViewClips((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, transform: { ...DEFAULT_TRANSFORM, ...(c.transform || {}), ...patch } }
          : c,
      ),
    );
  }

  // ---------- effect stack ops ----------
  function setEffects(id: string, next: ClipEffect[]) {
    setViewClips((prev) => prev.map((c) => (c.id === id ? { ...c, effects: next } : c)));
  }
  function addEffect(id: string, kind: EffectKind) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip) return;
    const list = [...(clip.effects || []), defaultEffect(kind, uid("fx"))];
    setEffects(id, list);
    pushToast(`${EFFECT_DEFS.find((d) => d.kind === kind)?.label || "Effect"} added`, "success");
  }
  function updateEffect(id: string, fxId: string, patch: Partial<ClipEffect>) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip) return;
    setEffects(
      id,
      (clip.effects || []).map((f) => (f.id === fxId ? { ...f, ...patch } : f)),
    );
  }
  function removeEffect(id: string, fxId: string) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip) return;
    setEffects(id, (clip.effects || []).filter((f) => f.id !== fxId));
  }
  function moveEffect(id: string, fxId: string, dir: -1 | 1) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip?.effects) return;
    const list = [...clip.effects];
    const i = list.findIndex((f) => f.id === fxId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setEffects(id, list);
  }

  function splitAtPlayhead() {
    // Prefer selected clip (works for V2 overlays); else the active main clip.
    let idx = selectedId ? viewClips.findIndex((c) => c.id === selectedId) : -1;
    if (idx < 0) idx = activeIndex;
    if (idx < 0) return;
    const clip = viewClips[idx];
    splitClipAt(clip.id, current);
  }

  /** Blade / programmatic cut at a timeline time on a specific clip. */
  function splitClipAt(clipId: string, timelineT: number) {
    const idx = viewClips.findIndex((c) => c.id === clipId);
    if (idx < 0) return;
    const clip = viewClips[idx];
    const clipStart = starts[idx];
    if (timelineT < clipStart || timelineT > clipStart + clipLength(clip)) {
      pushToast("Cut is outside the clip", "info");
      return;
    }
    const speed = clip.speed || 1;
    const sourceCut = clip.inPoint + (timelineT - clipStart) * speed;
    if (sourceCut <= clip.inPoint + 0.1 || sourceCut >= clip.outPoint - 0.1) return;
    const a: TimelineClip = { ...clip, id: uid("clip"), outPoint: sourceCut, transition: "none" };
    const b: TimelineClip = {
      ...clip,
      id: uid("clip"),
      inPoint: sourceCut,
      tlStart: clipLane(clip) > 0 || freeV1 ? timelineT : clip.tlStart,
    };
    setViewClips((prev) => {
      const next = [...prev];
      next.splice(idx, 1, a, b);
      return next;
    });
    setSelectedId(a.id);
    setSelectedIds([a.id, b.id]);
    pushToast("Split", "success");
  }

  function slipClip(clipId: string, deltaTimeline: number) {
    setViewClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const asset = assetById.get(c.assetId);
        const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? c.outPoint;
        const speed = c.speed || 1;
        const dur = c.outPoint - c.inPoint;
        const dSrc = deltaTimeline * speed;
        const ni = clamp(c.inPoint + dSrc, 0, Math.max(0, maxOut - dur));
        return { ...c, inPoint: ni, outPoint: ni + dur };
      }),
    );
  }

  function trimClipEdge(
    clipId: string,
    edge: "left" | "right",
    deltaTimeline: number,
    mode: "normal" | "ripple" | "roll",
  ) {
    setViewClips((prev) => {
      const { starts: st } = computeTimeline(prev, { freeMain: freeV1 });
      const idx = prev.findIndex((c) => c.id === clipId);
      if (idx < 0) return prev;
      const clip = prev[idx];
      const lane = clipLane(clip);
      const speed = clip.speed || 1;
      const asset = assetById.get(clip.assetId);
      const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? clip.outPoint;
      const oldLen = clipLength(clip);
      const start0 = st[idx] ?? 0;

      if (mode === "roll") {
        const ordered = prev
          .map((x, i) => ({ x, i, s: st[i] ?? 0 }))
          .filter((r) => clipLane(r.x) === lane)
          .sort((a, b) => a.s - b.s);
        const oi = ordered.findIndex((r) => r.x.id === clipId);
        if (edge === "left" && oi > 0) {
          const left = ordered[oi - 1].x;
          const dSrc = deltaTimeline * speed;
          const leftSpeed = left.speed || 1;
          const newIn = clamp(clip.inPoint + dSrc, 0, clip.outPoint - 0.2);
          const applied = (newIn - clip.inPoint) / speed;
          const newLeftOut = clamp(
            left.outPoint + applied * leftSpeed,
            left.inPoint + 0.2,
            assetById.get(left.assetId)?.duration ?? left.outPoint + 10,
          );
          return prev.map((c) => {
            if (c.id === left.id) return { ...c, outPoint: newLeftOut };
            if (c.id === clip.id) {
              const patch: Partial<TimelineClip> = { inPoint: newIn };
              if (lane > 0 || freeV1) {
                patch.tlStart = Math.max(0, (c.tlStart ?? start0) + applied);
              }
              return { ...c, ...patch };
            }
            return c;
          });
        }
        if (edge === "right" && oi >= 0 && oi < ordered.length - 1) {
          const right = ordered[oi + 1].x;
          const dSrc = deltaTimeline * speed;
          const rightSpeed = right.speed || 1;
          const newOut = clamp(clip.outPoint + dSrc, clip.inPoint + 0.2, maxOut);
          const applied = (newOut - clip.outPoint) / speed;
          const newRightIn = clamp(
            right.inPoint + applied * rightSpeed,
            0,
            right.outPoint - 0.2,
          );
          return prev.map((c) => {
            if (c.id === clip.id) return { ...c, outPoint: newOut };
            if (c.id === right.id) {
              const patch: Partial<TimelineClip> = { inPoint: newRightIn };
              if (lane > 0 || freeV1) {
                patch.tlStart = Math.max(0, (c.tlStart ?? 0) + applied);
              }
              return { ...c, ...patch };
            }
            return c;
          });
        }
        // fall through to normal if no neighbor
      }

      let next = [...prev];
      if (edge === "left") {
        const dSrc = deltaTimeline * speed;
        const newIn = clamp(clip.inPoint + dSrc, 0, clip.outPoint - 0.2);
        const appliedTl = (newIn - clip.inPoint) / speed;
        const patch: Partial<TimelineClip> = { inPoint: newIn };
        // Keep right edge fixed for free / overlay trims
        if (lane > 0 || freeV1) {
          patch.tlStart = Math.max(0, (clip.tlStart ?? start0) + appliedTl);
        }
        next[idx] = { ...clip, ...patch };
        const newLen = clipLength(next[idx]);
        const deltaLen = oldLen - newLen;
        if (mode === "ripple" && deltaLen !== 0 && (lane > 0 || freeV1)) {
          const cutAt = (next[idx].tlStart ?? start0) + newLen;
          next = next.map((c, i) => {
            if (i === idx || clipLane(c) !== lane) return c;
            const s = c.tlStart ?? st[i] ?? 0;
            if (s + 1e-4 >= cutAt - 1e-4 || s + 1e-4 >= start0 + oldLen) {
              return { ...c, tlStart: Math.max(0, s - deltaLen) };
            }
            return c;
          });
        }
      } else {
        const dSrc = deltaTimeline * speed;
        const newOut = clamp(clip.outPoint + dSrc, clip.inPoint + 0.2, maxOut);
        next[idx] = { ...clip, outPoint: newOut };
        const newLen = clipLength(next[idx]);
        const deltaLen = oldLen - newLen;
        if (mode === "ripple" && deltaLen !== 0 && (lane > 0 || freeV1)) {
          const cutAt = start0 + oldLen;
          next = next.map((c, i) => {
            if (i === idx || clipLane(c) !== lane) return c;
            const s = c.tlStart ?? st[i] ?? 0;
            if (s + 1e-4 >= cutAt) {
              return { ...c, tlStart: Math.max(0, s - deltaLen) };
            }
            return c;
          });
        }
      }
      return next;
    });
  }

  /** Select a clip — plain click replaces, Ctrl toggles, Shift ranges. */
  function selectClip(id: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
    const ctrl = Boolean(e?.ctrlKey || e?.metaKey);
    const shift = Boolean(e?.shiftKey);
    setSelectedTextId(null);
    if (ctrl) {
      setSelectedIds((prev) => {
        const has = prev.includes(id);
        const next = has ? prev.filter((x) => x !== id) : [...prev, id];
        setSelectedId(next[next.length - 1] ?? null);
        return next;
      });
      return;
    }
    if (shift && selectedId) {
      const a = viewClips.findIndex((c) => c.id === selectedId);
      const b = viewClips.findIndex((c) => c.id === id);
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const range = viewClips.slice(lo, hi + 1).map((c) => c.id);
        setSelectedIds(range);
        setSelectedId(id);
        return;
      }
    }
    setSelectedId(id);
    setSelectedIds([id]);
  }

  function deleteClip(id: string) {
    const victims = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
    setViewClips((prev) => {
      const removed = prev.filter((c) => victims.includes(c.id));
      let next = prev.filter((c) => !victims.includes(c.id));
      if (!rippleEnabled || !removed.length) return next;

      // Packed V1 closes gaps automatically via computeTimeline.
      // Free V1 + overlay lanes: pull later clips on the same lane left.
      for (const victim of removed) {
        const lane = clipLane(victim);
        if (lane === 0 && !freeV1) continue;
        const vStart = Math.max(0, victim.tlStart ?? 0);
        const vLen = clipLength(victim);
        const vEnd = vStart + vLen;
        next = next.map((c) => {
          if (clipLane(c) !== lane) return c;
          const s = Math.max(0, c.tlStart ?? 0);
          if (s + 1e-4 >= vEnd) return { ...c, tlStart: Math.max(0, s - vLen) };
          return c;
        });
      }
      return next;
    });
    setSelectedIds((prev) => prev.filter((x) => !victims.includes(x)));
    setSelectedId((sid) => (sid && victims.includes(sid) ? null : sid));
    // Drop orphaned linked A/V music when its parent clip is gone.
    setMusic((m) => (m?.linkedClipId && victims.includes(m.linkedClipId) ? null : m));
    setMusicTracks((prev) =>
      prev.filter((m) => !(m.linkedClipId && victims.includes(m.linkedClipId))),
    );
  }

  function duplicateClip(id: string) {
    const targets = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
    setViewClips((prev) => {
      const next = [...prev];
      // Insert copies after the last selected index to keep order stable.
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (targets.includes(next[i].id)) {
          insertAt = i + 1;
          break;
        }
      }
      const copies = targets
        .map((tid) => next.find((c) => c.id === tid))
        .filter((c): c is TimelineClip => Boolean(c))
        .map((c) => ({
          ...c,
          id: uid("clip"),
          color: { ...c.color },
          effects: (c.effects || []).map((f) => ({ ...f, id: uid("fx") })),
        }));
      next.splice(insertAt, 0, ...copies);
      if (copies[0]) {
        setSelectedId(copies[0].id);
        setSelectedIds(copies.map((c) => c.id));
      }
      return next;
    });
  }

  function moveClip(id: string, dir: -1 | 1) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip) return;
    if (clipLane(clip) > 0) {
      const chrome = clipLane(clip) >= 2 ? tracks.overlay2 : tracks.overlay;
      if (chrome.locked) {
        pushToast(`${chrome.name} is locked`, "info");
        return;
      }
      // Nudge overlay in time
      const i = viewClips.findIndex((c) => c.id === id);
      const step = magnetic ? 0.1 : 1 / FPS;
      patchClip(id, { tlStart: Math.max(0, (starts[i] ?? 0) + dir * step) });
      return;
    }
    if (tracks.video.locked) {
      pushToast("Video track is locked", "info");
      return;
    }
    setViewClips((prev) => {
      const mains = prev.filter((c) => clipLane(c) === 0);
      const ovs = prev.filter((c) => clipLane(c) > 0);
      const i = mains.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= mains.length) return prev;
      const nextMains = [...mains];
      [nextMains[i], nextMains[j]] = [nextMains[j], nextMains[i]];
      return [...nextMains, ...ovs];
    });
  }

  function reorderTo(id: string, targetIndex: number) {
    setViewClips((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (!clip || clipLane(clip) > 0) return prev;
      const mains = prev.filter((c) => clipLane(c) === 0);
      const ovs = prev.filter((c) => clipLane(c) > 0);
      const i = mains.findIndex((c) => c.id === id);
      if (i < 0) return prev;
      const clamped = clamp(targetIndex, 0, mains.length - 1);
      if (clamped === i) return prev;
      const nextMains = [...mains];
      const [moved] = nextMains.splice(i, 1);
      nextMains.splice(clamped, 0, moved);
      return [...nextMains, ...ovs];
    });
  }

  // generic horizontal drag → seconds delta
  function dragHandle(
    clientX0: number,
    onDelta: (deltaSec: number) => void,
    onUp?: () => void,
  ) {
    const move = (e: PointerEvent) => onDelta((e.clientX - clientX0) / pxPerSec);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function beginMagneticDrag(clipId: string) {
    setViewClips((prev) => {
      const { starts: packed } = computeTimeline(prev, { freeMain: false });
      return prev.map((c, i) =>
        clipLane(c) === 0 ? { ...c, tlStart: packed[i] ?? 0 } : c,
      );
    });
    setMagDragActive(true);
    void clipId;
  }

  /** While dragging: continuously close gaps around the dragged clip (Premiere-style). */
  function rippleMagneticWhileDrag(draggedId: string, draggedStart: number) {
    if (!magnetic || !rippleEnabled) {
      patchClip(draggedId, { tlStart: draggedStart });
      return;
    }
    setViewClips((prev) => {
      const mains = prev
        .filter((c) => clipLane(c) === 0)
        .map((c) =>
          c.id === draggedId ? { ...c, tlStart: Math.max(0, draggedStart) } : c,
        )
        .sort((a, b) => (a.tlStart ?? 0) - (b.tlStart ?? 0));
      const ovs = prev.filter((c) => clipLane(c) > 0);
      // Pack left of drag, then drag, then pack right flush to drag end.
      const dragIdx = mains.findIndex((c) => c.id === draggedId);
      if (dragIdx < 0) return prev;
      let acc = 0;
      const nextMains = mains.map((c, i) => {
        if (i < dragIdx) {
          const n = { ...c, tlStart: acc };
          acc += clipLength(c);
          return n;
        }
        if (i === dragIdx) {
          const start = Math.max(acc, Math.max(0, draggedStart));
          const n = { ...c, tlStart: start };
          acc = start + clipLength(c);
          return n;
        }
        const n = { ...c, tlStart: acc };
        acc += clipLength(c);
        return n;
      });
      return [...nextMains, ...ovs];
    });
  }

  function endMagneticDrag(_clipId: string) {
    setViewClips((prev) => {
      const mains = prev
        .filter((c) => clipLane(c) === 0)
        .slice()
        .sort((a, b) => (a.tlStart ?? 0) - (b.tlStart ?? 0));
      const ovs = prev.filter((c) => clipLane(c) > 0);
      if (rippleEnabled || magnetic) {
        let acc = 0;
        const packed = mains.map((c) => {
          const next = { ...c, tlStart: freeV1 ? acc : undefined };
          acc += clipLength(c);
          return next;
        });
        return [...packed, ...ovs];
      }
      return prev.map((c) =>
        clipLane(c) === 0 && !freeV1 ? { ...c, tlStart: undefined } : c,
      );
    });
    setMagDragActive(false);
  }

  function timeFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return clamp(x / pxPerSec, 0, scrubTotal);
  }

  // ---------- uploads ----------
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(`/api/editor/project/${project.id}/asset`, {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          const asset = data.asset as ProjectAsset;
          setAssets((prev) => [...prev, asset]);
          // Auto-generate a preview proxy for video/image (export stays full-res).
          if (asset.kind === "video" || asset.kind === "image") {
            void fetch(`/api/editor/project/${project.id}/proxy`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assetId: asset.id }),
            })
              .then(async (r) => {
                const d = await r.json();
                if (r.ok && d.project) setAssets((d.project as Project).assets);
              })
              .catch(() => {});
          }
          if (asset.kind === "lut") {
            pushToast("LUT uploaded — apply from Color grading", "success");
          } else if (asset.kind === "font") {
            pushToast("Font uploaded — pick it in Text styles", "success");
          } else if (asset.kind === "audio") {
            if (music) {
              setMusicTracks((prev) => [
                ...prev,
                {
                  assetId: asset.id,
                  start: current,
                  inPoint: 0,
                  outPoint: asset.duration || 30,
                  volume: 0.8,
                  fadeIn: 0.5,
                  fadeOut: 1,
                },
              ]);
            } else {
              setMusic({
                assetId: asset.id,
                start: current,
                inPoint: 0,
                outPoint: asset.duration || 30,
                volume: 0.8,
                fadeIn: 0.5,
                fadeOut: 1,
              });
            }
          } else {
            setFreeV1(true);
            setViewClips((prev) => {
              const clip = defaultClip(asset, uid("clip"));
              clip.tlStart = current;
              setSelectedId(clip.id);
              setSelectedIds([clip.id]);
              setSidebarTab("media");
              setTab("clip");
              return [...prev, clip];
            });
            pushToast(`Clip added at ${fmt(current)}`, "success");
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [project.id, current, music, fmt],
  );

  function addAssetToTimeline(asset: ProjectAsset, opts?: { lane?: number }) {
    if (asset.kind === "font") {
      pushToast("Select a text block, then choose this font", "info");
      setSidebarTab("ai");
      setTab("clip");
      return;
    }
    if (asset.kind === "lut") {
      if (!selectedClip) {
        pushToast("Select a clip to apply this LUT", "info");
        return;
      }
      patchColor(selectedClip.id, { lut: asset.filename, preset: "custom" });
      setSidebarTab("effects");
      setTab("color");
      pushToast("LUT applied", "success");
      return;
    }
    if (asset.kind === "audio") {
      if (music) {
        setMusicTracks((prev) => [
          ...prev,
          {
            assetId: asset.id,
            start: current,
            inPoint: 0,
            outPoint: asset.duration || 30,
            volume: 0.8,
            fadeIn: 0.5,
            fadeOut: 1,
          },
        ]);
      } else {
        setMusic({
          assetId: asset.id,
          start: current,
          inPoint: 0,
          outPoint: asset.duration || 30,
          volume: 0.8,
          fadeIn: 0.5,
          fadeOut: 1,
        });
      }
      setSidebarTab("media");
      setTab("audio");
      return;
    }
    const clip = defaultClip(asset, uid("clip"));
    const lane = opts?.lane;
    setFreeV1(true);
    if (typeof lane === "number" && lane > 0) {
      clip.lane = lane;
      clip.tlStart = current;
      if (asset.kind === "image") clip.outPoint = Math.min(clip.outPoint, 3);
    } else {
      clip.tlStart = current;
    }
    setViewClips((prev) => [...prev, clip]);
    setSelectedId(clip.id);
    setSelectedIds([clip.id]);
    if (lane === 1) pushToast("Added to V2 Overlay", "success");
    else if (lane === 2) pushToast("Added to V3 Overlay", "success");
    else pushToast(`Added at ${fmt(current)}`, "success");
  }

  function addAssetAsOverlay(asset: ProjectAsset) {
    if (asset.kind !== "image" && asset.kind !== "video") {
      addAssetToTimeline(asset);
      return;
    }
    addAssetToTimeline(asset, { lane: 1 });
  }

  async function uploadBrollFile(file: File) {
    setBrollBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/editor/project/${project.id}/asset`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const asset = data.asset as ProjectAsset;
      setAssets((prev) => [...prev, asset]);
      addAssetAsOverlay(asset);
      pushToast("B-roll on V2", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "B-roll upload failed", "error");
    } finally {
      setBrollBusy(false);
    }
  }

  async function generateBrollPreset(preset: string) {
    setBrollBusy(true);
    try {
      const res = await fetch("/api/ai/broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          preset,
          color: brandKit?.primary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate failed");
      const asset = data.asset as ProjectAsset;
      setAssets((prev) => [...prev, asset]);
      addAssetAsOverlay(asset);
      pushToast(`${asset.name} on V2`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "B-roll failed", "error");
    } finally {
      setBrollBusy(false);
    }
  }

  async function suggestAndInsertBroll() {
    setBrollBusy(true);
    try {
      pushToast("Finding B-roll moments…", "info");
      const res = await fetch("/api/ai/broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          action: "suggest",
          duration: total,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggest failed");
      const moments = (data.moments || []).slice(0, 3) as {
        start: number;
        end: number;
        reason: string;
        query: string;
      }[];
      if (!moments.length) {
        pushToast("No B-roll moments — run AI Analyze or transcribe first", "info");
        return;
      }

      const newAssets: ProjectAsset[] = [];
      const newClips: TimelineClip[] = [];
      for (const m of moments) {
        const genRes = await fetch("/api/ai/broll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            preset: "soft",
            label: (m.query || m.reason || "B-roll").slice(0, 32),
            color: brandKit?.primary,
          }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error || "Generate failed");
        const asset = genData.asset as ProjectAsset;
        newAssets.push(asset);
        const clip = defaultClip(asset, uid("clip"));
        clip.lane = 1;
        clip.tlStart = m.start;
        clip.outPoint = Math.max(1.5, Math.min(4, m.end - m.start || 2.5));
        newClips.push(clip);
      }

      setAssets((prev) => [...prev, ...newAssets]);
      setViewClips((prev) => [...prev, ...newClips]);
      if (newClips.length === 1) setSelectedId(newClips[0].id);
      setSelectedIds(newClips.map((c) => c.id));
      pushToast(`AI B-roll: ${newClips.length} overlay${newClips.length === 1 ? "" : "s"} on V2`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "B-roll suggest failed", "error");
    } finally {
      setBrollBusy(false);
    }
  }

  function applyDubTracks(tracks: DubTrackPiece[], muteDialogue: boolean) {
    const assetsIn: ProjectAsset[] = tracks.map((t) => ({
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
    const lanes: MusicTrack[] = tracks.map((t) => ({
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
  }

  async function onMusicFile(file: File) {
    setUploadingMusic(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/editor/project/${project.id}/asset`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const asset = data.asset as ProjectAsset;
      await applyImportedAudio(asset);
      pushToast("Audio added", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Music upload failed");
    } finally {
      setUploadingMusic(false);
    }
  }

  async function applyImportedAudio(asset: ProjectAsset) {
    setAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]));
    const track: MusicTrack = {
      assetId: asset.id,
      start: 0,
      inPoint: 0,
      outPoint: asset.duration || 30,
      volume: 0.8,
      fadeIn: 0.5,
      fadeOut: 1,
    };
    if (!music) setMusic(track);
    else setMusicTracks((prev) => [...prev, track]);
    setTab("audio");
    setSidebarTab("media");
  }

  async function onExtractAudioFromVideo(file: File) {
    setUploadingMusic(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/editor/project/${project.id}/audio-import`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extract failed");
      await applyImportedAudio(data.asset as ProjectAsset);
      pushToast("Audio extracted from video", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Extract failed", "error");
    } finally {
      setUploadingMusic(false);
    }
  }

  async function onImportYoutubeAudio(url: string) {
    setUploadingMusic(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/project/${project.id}/audio-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "YouTube import failed");
      await applyImportedAudio(data.asset as ProjectAsset);
      pushToast("YouTube audio added", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "YouTube import failed", "error");
    } finally {
      setUploadingMusic(false);
    }
  }

  async function generateLibraryAudio(
    preset: string,
    kind: "music" | "sfx",
  ) {
    setUploadingMusic(true);
    try {
      const res = await fetch("/api/ai/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, preset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate failed");
      const asset = data.asset as ProjectAsset;
      setAssets((prev) => [...prev, asset]);
      const track: MusicTrack = {
        assetId: asset.id,
        start: kind === "sfx" ? current : 0,
        inPoint: 0,
        outPoint: asset.duration || (kind === "sfx" ? 1 : 8),
        volume: kind === "sfx" ? 0.9 : 0.55,
        fadeIn: kind === "sfx" ? 0.02 : 0.4,
        fadeOut: kind === "sfx" ? 0.05 : 0.8,
        duck: kind === "music" ? 0.7 : 0,
      };
      if (kind === "music" && !music) {
        setMusic(track);
      } else {
        setMusicTracks((prev) => [...prev, track]);
      }
      setTab("audio");
      pushToast(`${asset.name} added`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Library audio failed", "error");
    } finally {
      setUploadingMusic(false);
    }
  }

  function patchMusic(patch: Partial<MusicTrack>) {
    setMusic((m) => (m ? { ...m, ...patch } : m));
  }

  function patchMusicTrack(index: number, patch: Partial<MusicTrack>) {
    setMusicTracks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  function removeMusicTrack(index: number) {
    setMusicTracks((prev) => prev.filter((_, i) => i !== index));
  }

  function addMarker() {
    const mk: TimelineMarker = {
      id: uid("mk"),
      t: current,
      label: `Marker ${markers.length + 1}`,
      color: "#e2a03f",
    };
    setMarkers((prev) => [...prev, mk].sort((a, b) => a.t - b.t));
    pushToast("Marker added", "success");
  }

  function seekPrevMarker() {
    const prev = [...markers].filter((m) => m.t < current - 0.05).pop();
    if (prev) seek(prev.t);
    else pushToast("No earlier marker", "info");
  }

  function seekNextMarker() {
    const next = markers.find((m) => m.t > current + 0.05);
    if (next) seek(next.t);
    else pushToast("No later marker", "info");
  }

  function patchMarker(id: string, patch: Partial<TimelineMarker>) {
    setMarkers((prev) =>
      prev
        .map((m) => (m.id === id ? { ...m, ...patch } : m))
        .sort((a, b) => a.t - b.t),
    );
  }

  function removeMarker(id: string) {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }

  async function runAiAnalyze() {
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
          projectId: project.id,
          assetIds,
          duration: total,
          videoTitle: project.name || "Clip",
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
        ? (data.cleanup as {
            id: string;
            start: number;
            end: number;
            label: string;
            kind: "silence" | "filler";
          }[])
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
      // Success criterion: analyze drops emoji markers on the timeline
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
        bits.length
          ? `AI analyze ready (${bits.join(" · ")})`
          : "AI analyze ready",
        "success",
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Analyze failed", "error");
    } finally {
      setAiAnalyzing(false);
    }
  }

  function applyAiMarkers() {
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
  }

  function applyAiSuggestion(s: AiSuggestion) {
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
  }

  function applyHookFix(id: HookFixId | string) {
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
      return;
    }
  }

  function insertShellCard(card: ShellCard) {
    insertTextStyle(card.style, card.label);
  }

  function applyCleanupItem(item: {
    id: string;
    start: number;
    end: number;
    label: string;
    kind: "silence" | "filler";
  }) {
    if (item.end - item.start < 0.15) {
      seek(item.start);
      pushToast("Range too short to trim", "info");
      return;
    }
    rippleTrimRange(item.start, item.end);
    setCleanupItems((prev) => prev.filter((x) => x.id !== item.id));
  }

  function applyBrandKitToTimeline(kit: BrandKit) {
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
  }

  function applyChaptersAsMarkers(chapters: string[]) {
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
  }

  function hydrateFromCloudProject(remote: Project) {
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
  }

  function syncCalendarFromJobs(
    jobs: { title: string; dueAt: string; status: string; platform: string }[],
  ) {
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
  }

  async function generateGrowthThumb(
    headline: string,
    layout?: import("@/lib/thumbnail-layout").ThumbnailLayoutPreset,
  ): Promise<string | null> {
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
          projectId: project.id,
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
  }

  async function batchExportAspects(aspects: AspectRatio[]) {
    // Save first so disk project matches timeline
    // Honor mute/hide like single export
    const anySolo = Object.values(tracks).some((t) => t.solo);
    const audible = (id: keyof typeof tracks) =>
      anySolo ? tracks[id].solo : !tracks[id].muted;
    const visible = (id: keyof typeof tracks) => !tracks[id].hidden;

    const exportClips = rootClipsRef.current
      .filter((c) => {
        const lane = clipLane(c);
        if (lane === 0) return visible("video");
        if (lane === 1) return visible("overlay");
        return visible("overlay2");
      })
      .map((c) => {
        const lane = clipLane(c);
        const trackId =
          lane === 0 ? "video" : lane === 1 ? "overlay" : ("overlay2" as const);
        if (!audible(trackId)) return { ...c, volume: 0, linkedAudio: false as const };
        return c;
      });

    let queued = 0;
    for (const a of aspects) {
      const res = await fetch(`/api/editor/project/${project.id}/export`, {
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
  }

  async function runAiSearch(query: string, mode: "keyword" | "semantic" = "semantic") {
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, query, mode }),
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
  }

  async function runAiReframe() {
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
          projectId: project.id,
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
        // Keep other animated props (opacity/volume/etc.) if present
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
  }

  async function exportThumbnail(headline?: string) {
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
          projectId: project.id,
          assetId,
          t: current,
          headline: headline || growthPack?.titles?.tiktok?.[0] || project.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Thumb failed");
      pushToast("Thumbnail ready", "success");
      if (data.url) window.open(data.url, "_blank");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Thumb failed", "error");
    }
  }

  async function createShareLink() {
    try {
      const res = await fetch(`/api/editor/project/${project.id}/share`, {
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
  }

  /** Ripple-trim MVP: remove overlapping main-lane media covering [start, end]. */
  function rippleTrimRange(start: number, end: number, opts?: { silent?: boolean }) {
    if (end - start < 0.15) {
      if (!opts?.silent) pushToast("Range too short", "info");
      return;
    }
    setViewClips((prev) => {
      const next = applyRippleTrimOnce(prev, start, end, freeV1);
      if (next === prev) {
        if (!opts?.silent) pushToast("No clip under that range", "info");
        return prev;
      }
      if (!opts?.silent) pushToast("Range trimmed", "success");
      return next;
    });
    seek(start);
  }

  /** Trim all cleanup ranges from the end so earlier offsets stay valid. */
  function applyCleanupAll() {
    const items = [...cleanupItems]
      .filter((x) => x.end - x.start >= 0.15)
      .sort((a, b) => b.start - a.start);
    if (!items.length) {
      pushToast("Nothing to trim", "info");
      return;
    }
    setViewClips((prev) => {
      let cur = prev;
      for (const item of items) {
        cur = applyRippleTrimOnce(cur, item.start, item.end, freeV1);
      }
      return cur;
    });
    setCleanupItems([]);
    const last = items[items.length - 1];
    if (last) seek(last.start);
    pushToast(`Trimmed ${items.length} gaps`, "success");
  }

  function applyDenoiseToMainClips(level: number, opts?: { silent?: boolean }) {
    setCleanupDenoiseLevel(level);
    setViewClips((prev) =>
      prev.map((c) => {
        if (clipLane(c) !== 0) return c;
        const asset = assets.find((a) => a.id === c.assetId);
        if (!asset || asset.kind !== "video" || !asset.hasAudio) return c;
        return { ...c, denoise: level };
      }),
    );
    if (!opts?.silent && level > 0.02) {
      pushToast(`Denoise ${Math.round(level * 100)}% on main clips`, "success");
    }
  }

  function applyDenoiseDialogue() {
    applyDenoiseToMainClips(0.4);
  }

  function duckAllMusicBeds() {
    const lanes = [
      ...(music ? [music] : []),
      ...musicTracks,
    ];
    if (!lanes.length) {
      pushToast("Add a music bed first", "info");
      setSidebarTab("media");
      return;
    }
    if (music) {
      setMusic({ ...music, duck: Math.max(music.duck ?? 0, 0.7) });
    }
    setMusicTracks((prev) =>
      prev.map((t) => ({ ...t, duck: Math.max(t.duck ?? 0, 0.7) })),
    );
    pushToast(`Duck ${lanes.length} music bed${lanes.length > 1 ? "s" : ""} at 70%`, "success");
  }

  function burnTranscriptCaptions(
    segments: {
      start: number;
      end: number;
      text: string;
      words?: { speakerId?: number }[];
    }[],
  ) {
    const captionTpl =
      TEXT_TEMPLATES.find((t) => t.id === "caption")?.apply || {
        size: 0.05,
        y: 0.88,
        bold: true,
        font: "Arial",
        stroke: 2,
        strokeColor: "#000000",
        color: "#ffffff",
        anim: "none" as const,
      };

    type CapLine = {
      start: number;
      end: number;
      text: string;
      speaker: number;
      important: boolean;
    };
    const merged: CapLine[] = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const text = (s.text || "").trim();
      if (!text) continue;
      const start = Math.max(0, s.start);
      const end = Math.max(start + 0.4, s.end);
      const speakerWord = s.words?.find((w) => typeof w.speakerId === "number");
      const speaker = speakerWord?.speakerId ?? i % 4;
      const important = /[!?]|(^|\s)(wait|listen|important|never|always)\b/i.test(text);
      const last = merged[merged.length - 1];
      if (
        last &&
        last.speaker === speaker &&
        start - last.end < 0.15 &&
        last.text.length + text.length < 72
      ) {
        last.end = end;
        last.text = `${last.text} ${text}`.trim();
        last.important = last.important || important;
      } else {
        merged.push({ start, end, text, speaker, important });
      }
    }
    const use = merged.slice(0, 48);
    if (!use.length) {
      pushToast("No transcript lines to burn", "info");
      return;
    }
    const added = use.map((s) => ({
      ...defaultText(uid("cap"), s.start),
      ...captionTpl,
      text: s.text.slice(0, 90),
      start: s.start,
      duration: Math.min(6, Math.max(0.6, s.end - s.start)),
      y: 0.82,
      size: s.important ? 0.065 : 0.055,
      bold: true,
      stroke: 3,
      strokeColor: "#000000",
      color: captionColorForSpeaker(s.speaker, s.important),
      anim: "none" as const,
      transform: "none" as const,
    }));
    setTexts((prev) => [...prev, ...added]);
    setSidebarTab("ai");
    setTab("text");
    pushToast(`Burned ${added.length} caption${added.length > 1 ? "s" : ""}`, "success");
  }

  function applyAiEditPrompt(prompt: string, scope: "selected" | "all") {
    const result = parseEditPrompt(prompt);
    const unclear = result.summary[0]?.startsWith("No clear");
    if (unclear && !result.color && !result.transform && result.speed == null) {
      pushToast(result.summary[0], "info");
      return;
    }
    if (scope === "selected") {
      if (!selectedClip) {
        pushToast("Select a clip first", "info");
        return;
      }
      setViewClips((prev) =>
        prev.map((c) => (c.id === selectedClip.id ? applyEditResultToClip(c, result) : c)),
      );
    } else {
      setViewClips((prev) => prev.map((c) => applyEditResultToClip(c, result)));
    }
    pushToast(result.summary.join(" · "), "success");
  }

  function addManualCaption(opts: {
    text: string;
    start: number;
    duration: number;
    speaker?: number;
    important?: boolean;
  }) {
    const t = {
      ...defaultText(uid("cap"), opts.start),
      text: opts.text,
      start: Math.max(0, opts.start),
      duration: Math.max(0.4, opts.duration),
      y: 0.82,
      size: opts.important ? 0.065 : 0.055,
      bold: true,
      stroke: 3,
      strokeColor: "#000000",
      color: captionColorForSpeaker(opts.speaker ?? 0, opts.important),
      anim: "none" as const,
      transform: "none" as const,
    };
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setTab("text");
    pushToast(`Subtitle at ${opts.start.toFixed(1)}s`, "success");
  }

  async function autoCaptionsFromSpeech() {
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
        body: JSON.stringify({ projectId: project.id, assetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcribe failed");
      burnTranscriptCaptions(data.segments || []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Caption failed", "error");
      setSidebarTab("ai");
    }
  }

  function applyStabilizeToMainClips(level: number, opts?: { silent?: boolean }) {
    setCleanupStabilizeLevel(level);
    setViewClips((prev) =>
      prev.map((c) => {
        if (clipLane(c) !== 0) return c;
        const asset = assets.find((a) => a.id === c.assetId);
        if (!asset || asset.kind !== "video") return c;
        return { ...c, stabilize: level };
      }),
    );
    if (!opts?.silent && level > 0.02) {
      pushToast(`Stabilize ${Math.round(level * 100)}% on main clips`, "success");
    }
  }

  function applyStabilizeMain() {
    applyStabilizeToMainClips(0.55);
  }

  function addAdjustmentLayer() {
    const clip: TimelineClip = {
      id: uid("adj"),
      assetId: "",
      inPoint: 0,
      outPoint: 4,
      speed: 1,
      transition: "none",
      transitionDuration: 0.5,
      color: { ...DEFAULT_COLOR },
      transform: { ...DEFAULT_TRANSFORM, opacity: 0.35 },
      effects: [],
      lane: 1,
      tlStart: current,
      adjustment: true,
      linkedAudio: false,
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
    };
    setViewClips((prev) => [...prev, clip]);
    setSelectedId(clip.id);
    setSelectedIds([clip.id]);
    setTab("color");
    setSidebarTab("effects");
    pushToast("Adjustment layer on V2 — grade applies over clips below", "success");
  }

  function addClipLayer(clipId: string, assetId: string, name?: string) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip) return;
    const asset = assetById.get(assetId);
    if (!asset || (asset.kind !== "video" && asset.kind !== "image")) {
      pushToast("Pick a video or photo for the layer", "info");
      return;
    }
    const n = (clip.layers?.length || 0) + 1;
    const layer: ClipLayer = {
      id: uid("lyr"),
      name: (name || "").trim() || `Layer #${n}`,
      assetId,
      enabled: true,
      opacity: 1,
    };
    patchClip(clipId, { layers: [...(clip.layers || []), layer] });
    pushToast(`Added ${layer.name}`, "success");
    return layer.id;
  }

  async function uploadClipLayerFile(clipId: string, file: File, name?: string) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/editor/project/${project.id}/asset`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const asset = data.asset as ProjectAsset;
      setAssets((prev) => [...prev, asset]);
      return addClipLayer(clipId, asset.id, name);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Layer upload failed", "error");
      return undefined;
    }
  }

  function renameClipLayer(clipId: string, layerId: string, name: string) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip?.layers) return;
    const next = name.trim() || "Layer";
    patchClip(clipId, {
      layers: clip.layers.map((l) => (l.id === layerId ? { ...l, name: next } : l)),
    });
  }

  function removeClipLayer(clipId: string, layerId: string) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip?.layers) return;
    patchClip(clipId, { layers: clip.layers.filter((l) => l.id !== layerId) });
  }

  function patchClipLayer(clipId: string, layerId: string, patch: Partial<ClipLayer>) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip?.layers) return;
    patchClip(clipId, {
      layers: clip.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    });
  }

  function enterCompound(id: string) {
    const clip = viewClips.find((c) => c.id === id);
    if (!clip?.compound || !clip.children?.length) {
      pushToast("Not a compound clip", "info");
      return;
    }
    setNestPath((p) => [...p, id]);
    const first = clip.children[0];
    setSelectedId(first?.id ?? null);
    setSelectedIds(first ? [first.id] : []);
    setCurrent(0);
    curRef.current = 0;
    setPlaying(false);
    musicRef.current?.pause();
    sfxRefs.current.forEach((a) => a?.pause());
    pushToast("Editing compound sequence", "info");
  }

  function exitCompound() {
    if (!nestPath.length) return;
    const parentId = nestPath[nestPath.length - 1];
    setNestPath((p) => p.slice(0, -1));
    setSelectedId(parentId);
    setSelectedIds([parentId]);
    setCurrent(0);
    curRef.current = 0;
    setPlaying(false);
  }

  function createCompoundFromSelection() {
    const ids = selectedIds.length > 1 ? selectedIds : selectedId ? [selectedId] : [];
    const mains = viewClips
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => ids.includes(c.id) && clipLane(c) === 0 && !c.compound);
    if (mains.length < 2) {
      pushToast("Select 2+ main-lane clips to compound", "info");
      return;
    }
    mains.sort((a, b) => a.i - b.i);
    const children = mains.map(({ c }) => JSON.parse(JSON.stringify(c)) as TimelineClip);
    const compound: TimelineClip = {
      id: uid("cmp"),
      assetId: children[0]?.assetId || "",
      inPoint: 0,
      outPoint: children.reduce((s, c) => s + clipLength(c), 0),
      speed: 1,
      transition: "none",
      transitionDuration: 0.5,
      color: { ...DEFAULT_COLOR },
      transform: { ...DEFAULT_TRANSFORM },
      effects: [],
      lane: 0,
      compound: true,
      children,
      linkedAudio: true,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    const victimIds = new Set(mains.map((m) => m.c.id));
    setViewClips((prev) => {
      const next: TimelineClip[] = [];
      let inserted = false;
      for (const c of prev) {
        if (victimIds.has(c.id)) {
          if (!inserted) {
            next.push(compound);
            inserted = true;
          }
          continue;
        }
        next.push(c);
      }
      return next;
    });
    setSelectedId(compound.id);
    setSelectedIds([compound.id]);
    pushToast(`Compound created (${children.length} clips)`, "success");
  }

  function explodeCompound(clipId?: string) {
    const id = clipId || selectedId;
    const parent = viewClips.find((c) => c.id === id);
    if (!parent?.compound || !parent.children?.length) {
      pushToast("Select a compound clip to explode", "info");
      return;
    }
    const kids = parent.children.map((c) => ({
      ...JSON.parse(JSON.stringify(c)),
      id: uid("clip"),
      lane: 0,
      compound: undefined,
      children: undefined,
    })) as TimelineClip[];
    setViewClips((prev) => {
      const next: TimelineClip[] = [];
      for (const c of prev) {
        if (c.id === parent.id) next.push(...kids);
        else next.push(c);
      }
      return next;
    });
    setSelectedId(kids[0]?.id ?? null);
    setSelectedIds(kids.map((k) => k.id));
    pushToast("Compound exploded", "success");
  }

  function createMulticamFromSelection() {
    const ids = selectedIds.length > 1 ? selectedIds : [];
    const targets = viewClips.filter((c) => ids.includes(c.id) && clipLane(c) === 0 && !c.compound);
    if (targets.length < 2) {
      pushToast("Select 2+ main clips for multicam", "info");
      return;
    }
    const groupId = uid("mc");
    setViewClips((prev) =>
      prev.map((c) => {
        if (!ids.includes(c.id)) return c;
        const active = c.id === targets[0].id;
        return { ...c, multicamId: groupId, multicamActive: active };
      }),
    );
    pushToast(`Multicam group (${targets.length} angles) — first is live`, "success");
  }

  function setMulticamActive(clipId: string) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip?.multicamId) return;
    const gid = clip.multicamId;
    setViewClips((prev) =>
      prev.map((c) =>
        c.multicamId === gid ? { ...c, multicamActive: c.id === clipId } : c,
      ),
    );
    pushToast("Multicam angle live", "success");
  }

  /** Waveform-align sibling angles to the live master (falls back to timeline offsets). */
  async function syncMulticamGroup(clipId?: string) {
    const id = clipId || selectedId;
    const master = viewClips.find((c) => c.id === id);
    if (!master?.multicamId) {
      pushToast("Select a multicam clip to sync", "info");
      return;
    }
    const gid = master.multicamId;
    const angles = viewClips.filter((c) => c.multicamId === gid);
    const masterAsset = assetById.get(master.assetId);
    if (!masterAsset) {
      pushToast("Master media missing", "error");
      return;
    }
    pushToast("Syncing multicam audio…", "info");
    try {
      const res = await fetch(`/api/editor/project/${project.id}/multicam-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterAssetFile: masterAsset.filename,
          angleAssetFiles: angles
            .filter((c) => c.id !== master.id)
            .map((c) => ({
              clipId: c.id,
              filename: assetById.get(c.assetId)?.filename || "",
            }))
            .filter((a) => a.filename),
        }),
      });
      const data = await res.json();
      if (res.ok && data.offsets) {
        const offsets = data.offsets as Record<string, number>;
        setViewClips((prev) =>
          prev.map((c) => {
            if (c.multicamId !== gid) return c;
            if (c.id === master.id) return { ...c, multicamSync: 0 };
            return { ...c, multicamSync: offsets[c.id] ?? 0 };
          }),
        );
        pushToast("Multicam angles waveform-synced", "success");
        return;
      }
    } catch {
      // fall through to timeline offset
    }
    const masterStart = starts[viewClips.findIndex((c) => c.id === master.id)] ?? 0;
    setViewClips((prev) =>
      prev.map((c) => {
        if (c.multicamId !== gid) return c;
        const i = prev.findIndex((x) => x.id === c.id);
        const s = starts[i] ?? 0;
        return { ...c, multicamSync: s - masterStart };
      }),
    );
    pushToast("Multicam synced via timeline offsets", "success");
  }

  /**
   * Record a multicam cut at the playhead: make `clipId` live and split the
   * previous live angle so the edit sticks from this moment forward.
   */
  function cutMulticamAtPlayhead(clipId: string) {
    const next = viewClips.find((c) => c.id === clipId);
    if (!next?.multicamId) return;
    const gid = next.multicamId;
    const live = viewClips.find((c) => c.multicamId === gid && c.multicamActive);
    if (!live || live.id === next.id) {
      setMulticamActive(clipId);
      return;
    }
    const liveIdx = viewClips.findIndex((c) => c.id === live.id);
    const liveStart = starts[liveIdx] ?? 0;
    const liveLen = clipLength(live);
    const local = current - liveStart;
    if (local > 0.15 && local < liveLen - 0.15) {
      // Split live angle at playhead, keep left live until cut, right dormant.
      const speed = live.speed || 1;
      const cutSrc = live.inPoint + local * speed;
      const left: TimelineClip = {
        ...live,
        id: uid("clip"),
        outPoint: cutSrc,
        multicamActive: true,
      };
      const right: TimelineClip = {
        ...live,
        id: uid("clip"),
        inPoint: cutSrc,
        multicamActive: false,
      };
      const activated: TimelineClip = {
        ...next,
        multicamActive: true,
        // Match remaining span on timeline via sync
        multicamSync: next.multicamSync ?? 0,
      };
      setViewClips((prev) => {
        const out: TimelineClip[] = [];
        for (const c of prev) {
          if (c.id === live.id) {
            out.push(left, { ...activated, id: uid("clip") }, right);
          } else if (c.multicamId === gid) {
            out.push({ ...c, multicamActive: false });
          } else {
            out.push(c);
          }
        }
        return out;
      });
      pushToast("Multicam cut recorded at playhead", "success");
    } else {
      setMulticamActive(clipId);
    }
  }

  // ---------- text ops ----------
  function addText() {
    const t = defaultText(uid("txt"), current);
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setSidebarTab("ai");
    setTab("text");
  }

  function insertTextStyle(style: Partial<TextOverlay>, label: string) {
    const t = { ...defaultText(uid("txt"), current), ...style };
    if (!style.text) t.text = label;
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setSidebarTab("ai");
    setTab("text");
    pushToast(`${label} added`, "success");
  }

  function applyTransitionKind(kind: TransitionKind, duration?: number) {
    if (!selectedClip) {
      pushToast("Select a clip to apply a transition", "info");
      return;
    }
    setPreviewTransition(kind);
    patchClip(selectedClip.id, {
      transition: kind,
      transitionDuration: duration ?? (selectedClip.transitionDuration || 0.5),
    });
    pushToast(`${kind === "none" ? "Cut" : kind} applied`, "success");
  }

  /** Lift a video clip's audio onto the music lane (stays linked to the clip). */
  function detachClipAudio(clipId?: string) {
    const id = clipId || selectedId;
    const clip = viewClips.find((c) => c.id === id);
    const asset = clip ? assetById.get(clip.assetId) : null;
    if (!clip || !asset || asset.kind !== "video" || !asset.hasAudio) {
      pushToast("Select a video clip that has audio", "info");
      return;
    }
    const i = viewClips.findIndex((c) => c.id === clip.id);
    const start = starts[i] || 0;
    const vol = clip.volume > 0.01 ? clip.volume : 1;
    const lane: MusicTrack = {
      assetId: asset.id,
      start,
      inPoint: clip.inPoint,
      outPoint: Math.min(clip.outPoint, asset.duration || clip.outPoint),
      volume: vol,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      linkedClipId: clip.id,
    };
    if (music) {
      setMusicTracks((prev) => [...prev, lane]);
    } else {
      setMusic(lane);
    }
    patchClip(clip.id, { volume: 0, linkedAudio: false });
    setSidebarTab("media");
      setTab("audio");
    pushToast("Audio linked on music lane — follows this clip", "success");
  }

  /** Put linked music audio back onto the clip and clear the music link. */
  function relinkClipAudio(clipId?: string) {
    const id = clipId || selectedId || music?.linkedClipId;
    if (!id || !music?.linkedClipId || music.linkedClipId !== id) {
      pushToast("No linked audio for this clip", "info");
      return;
    }
    patchClip(id, { volume: music.volume || 1, linkedAudio: true });
    setMusic(null);
    pushToast("Audio re-linked to clip", "success");
  }

  function addSticker(glyph: string) {
    const t = defaultText(uid("stk"), current);
    t.text = glyph;
    t.size = 0.16;
    t.duration = 2.5;
    t.bold = false;
    t.stroke = 0;
    t.anim = "fade";
    t.font = "Segoe UI Emoji";
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setSidebarTab("ai");
      setTab("clip");
    pushToast("Sticker added", "success");
  }

  async function addPackSticker(src: string, label: string) {
    const isLottie = src.endsWith(".json");
    if (isLottie) {
      const t = defaultText(uid("stk"), current);
      t.text = label;
      t.size = 0.18;
      t.duration = 3;
      t.bold = false;
      t.stroke = 0;
      t.anim = "fade";
      t.stickerUrl = src;
      t.stickerLottie = true;
      setTexts((prev) => [...prev, t]);
      setSelectedTextId(t.id);
      setSidebarTab("ai");
      setTab("clip");
      pushToast(`${label} Lottie sticker added`, "success");
      return;
    }
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Sticker missing");
      const blob = await res.blob();
      const file = new File([blob], `${label.replace(/\s+/g, "-").toLowerCase()}.svg`, {
        type: blob.type || "image/svg+xml",
      });
      const form = new FormData();
      form.append("file", file);
      const up = await fetch(`/api/editor/project/${project.id}/asset`, {
        method: "POST",
        body: form,
      });
      const data = await up.json();
      if (!up.ok) throw new Error(data.error || "Upload failed");
      const asset = data.asset as ProjectAsset;
      setAssets((prev) => [...prev, asset]);
      addAssetToTimeline(asset, { lane: 1 });
      pushToast(`${label} sticker on V2`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Sticker failed", "error");
    }
  }
  function patchText(id: string, patch: Partial<TextOverlay>) {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function deleteText(id: string) {
    setTexts((prev) => {
      const victim = prev.find((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (!rippleEnabled || !victim) return next;
      // Ripple: shift later text blocks left by the removed duration.
      return next.map((t) =>
        t.start >= victim.start + victim.duration
          ? { ...t, start: Math.max(0, t.start - victim.duration) }
          : t,
      );
    });
    setSelectedTextId((s) => (s === id ? null : s));
  }

  // ---------- transitions ----------
  function applyTransition() {
    if (!selectedClip) {
      setError("Select a clip first, then apply the transition.");
      return;
    }
    patchClip(selectedClip.id, { transition: previewTransition });
    setError(null);
  }

  // when a clip is selected, mirror its transition into the preview panel
  useEffect(() => {
    if (selectedClip && selectedClip.transition !== "none") {
      setPreviewTransition(selectedClip.transition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---------- export queue ----------
  async function refreshExportJobs() {
    try {
      const res = await fetch(`/api/editor/project/${project.id}/export`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) setExportJobs(data.jobs);
    } catch {
      // ignore
    }
  }

  async function exportVideo() {
    setShowExport(false);
    setExporting(true);
    setError(null);
    setResult(null);
    setPlaying(false);
    try {
      // Honor timeline mute / hide / solo for this export (UI chrome → bake).
      const anySolo = Object.values(tracks).some((t) => t.solo);
      const audible = (id: keyof typeof tracks) =>
        anySolo ? tracks[id].solo : !tracks[id].muted;
      const visible = (id: keyof typeof tracks) => !tracks[id].hidden;

      const exportClips = rootClipsRef.current
        .filter((c) => {
          const lane = clipLane(c);
          if (lane === 0) return visible("video");
          if (lane === 1) return visible("overlay");
          return visible("overlay2");
        })
        .map((c) => {
          const lane = clipLane(c);
          const trackId =
            lane === 0 ? "video" : lane === 1 ? "overlay" : ("overlay2" as const);
          if (!audible(trackId)) return { ...c, volume: 0, linkedAudio: false as const };
          return c;
        });

      const res = await fetch(`/api/editor/project/${project.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspect,
          clips: exportClips,
          freeMain: freeV1 || undefined,
          music: music && audible("music") ? music : undefined,
          musicTracks:
            musicTracks.length && audible("music") ? musicTracks : undefined,
          texts: visible("text") ? texts.filter((t) => textHasContent(t)) : [],
          export: exportOpts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      const jobId = data.jobId as string;
      setActiveJobId(jobId);
      pushToast("Export queued", "info");
      await refreshExportJobs();

      // Poll until terminal
      const deadline = Date.now() + 9 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 600));
        const st = await fetch(
          `/api/editor/project/${project.id}/export?jobId=${encodeURIComponent(jobId)}`,
        );
        const body = await st.json();
        const job = body.job as
          | {
              status: string;
              error?: string;
              downloadUrl?: string;
              previewUrl?: string;
            }
          | undefined;
        if (!job) continue;
        await refreshExportJobs();
        if (job.status === "done") {
          setResult({
            downloadUrl: job.downloadUrl!,
            previewUrl: job.previewUrl!,
          });
          pushToast("Export ready — opening Growth Hub", "success");
          setShowGrowthHub(true);
          return;
        }
        if (job.status === "error") throw new Error(job.error || "Export failed");
        if (job.status === "cancelled") {
          pushToast("Export cancelled", "info");
          return;
        }
      }
      throw new Error("Export timed out — check the queue panel");
    } catch (err) {
      const m = err instanceof Error ? err.message : "Export failed";
      setError(m);
      pushToast(m, "error");
    } finally {
      setExporting(false);
      setActiveJobId(null);
      await refreshExportJobs();
    }
  }

  async function cancelExport() {
    try {
      const q = activeJobId ? `?jobId=${encodeURIComponent(activeJobId)}` : "";
      await fetch(`/api/editor/project/${project.id}/export${q}`, { method: "DELETE" });
      pushToast("Export cancelled", "info");
      await refreshExportJobs();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshExportJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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

  const studioCommands: CommandItem[] = useMemo(
    () => [
      { id: "play", label: "Play / Pause", shortcut: "Space", run: () => togglePlay() },
      { id: "split", label: "Split at playhead", shortcut: "S", run: () => splitAtPlayhead() },
      { id: "export", label: "Export video", run: () => setShowExport(true) },
      { id: "save", label: "Save project", shortcut: "Ctrl+S", run: () => saveProjectState(false) },
      { id: "undo", label: "Undo", shortcut: "Ctrl+Z", run: () => undo() },
      { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", run: () => redo() },
      { id: "text", label: "Add text", run: () => addText() },
      { id: "adj", label: "Add adjustment layer", run: () => addAdjustmentLayer() },
      { id: "marker", label: "Add marker", shortcut: "Shift+M", run: () => addMarker() },
      { id: "marker-prev", label: "Previous marker", shortcut: "[", run: () => seekPrevMarker() },
      { id: "marker-next", label: "Next marker", shortcut: "]", run: () => seekNextMarker() },
      { id: "history", label: "Show undo history", run: () => setHistoryOpen(true) },
      { id: "ws-edit", label: "Workspace: Editing", hint: "layout", run: () => applyWorkspace("editing") },
      { id: "ws-color", label: "Workspace: Color", hint: "layout", run: () => applyWorkspace("color") },
      { id: "ws-audio", label: "Workspace: Audio", hint: "layout", run: () => applyWorkspace("audio") },
      { id: "ws-deliver", label: "Workspace: Deliver", hint: "layout", run: () => applyWorkspace("deliver") },
      {
        id: "growth-hub",
        label: "Open Growth Hub",
        hint: "AI",
        run: () => setShowGrowthHub(true),
      },
      {
        id: "ai-analyze",
        label: "AI: Analyze timeline",
        hint: "AI",
        run: () => {
          setSidebarTab("ai");
          void runAiAnalyze();
        },
      },
      {
        id: "ai-search",
        label: "AI: Search transcript",
        hint: "AI",
        run: () => setSidebarTab("ai"),
      },
      {
        id: "ai-reframe",
        label: "AI: Reframe to face",
        hint: "AI",
        run: () => void runAiReframe(),
      },
      {
        id: "ai-broll-suggest",
        label: "AI: Suggest B-roll",
        hint: "AI",
        run: () => {
          setSidebarTab("broll");
          void suggestAndInsertBroll();
        },
      },
      {
        id: "share-review",
        label: "Share review link",
        hint: "collab",
        run: () => void createShareLink(),
      },
      {
        id: "export-thumb",
        label: "Export thumbnail PNG",
        hint: "AI",
        run: () => void exportThumbnail(),
      },
      { id: "float-bin", label: "Toggle float media bin", run: () => setFloatBin((v) => !v) },
      { id: "float-insp", label: "Toggle float inspector", run: () => setFloatInspector((v) => !v) },
      { id: "proxy", label: "Toggle proxy preview", run: () => setUseProxy((v) => !v) },
      { id: "proxy-batch",
        label: "Generate proxies for all media",
        run: () => void generateProxiesBatch(),
      },
      {
        id: "duck-all",
        label: "Duck all music beds",
        run: () => duckAllMusicBeds(),
      },
      {
        id: "ramp-in",
        label: "Speed ramp in (slow→1×)",
        run: () => {
          const id = selectedId || viewClips[activeMainIndex(viewClips, starts, current)]?.id;
          if (id) applySpeedRamp(id, "ramp-in");
          else pushToast("Select a clip first", "info");
        },
      },
      {
        id: "ramp-out",
        label: "Speed ramp out (1×→slow)",
        run: () => {
          const id = selectedId || viewClips[activeMainIndex(viewClips, starts, current)]?.id;
          if (id) applySpeedRamp(id, "ramp-out");
          else pushToast("Select a clip first", "info");
        },
      },
      {
        id: "slow-mo",
        label: "Slow-mo punch ramp",
        run: () => {
          const id = selectedId || viewClips[activeMainIndex(viewClips, starts, current)]?.id;
          if (id) applySpeedRamp(id, "slow-mo");
          else pushToast("Select a clip first", "info");
        },
      },
      { id: "theme", label: "Toggle day / night theme", run: () => setDarkTheme((v) => !v) },
      { id: "keymap", label: "Keyboard shortcuts", run: () => setShowKeymap(true) },
      { id: "tool-select", label: "Tool: Select", shortcut: "V", run: () => setEditTool("select") },
      { id: "tool-blade", label: "Tool: Blade", shortcut: "C", run: () => setEditTool("blade") },
      { id: "tool-trim", label: "Tool: Trim", shortcut: "T", run: () => setEditTool("trim") },
      { id: "tool-ripple", label: "Tool: Ripple", shortcut: "R", run: () => setEditTool("ripple") },
      { id: "tool-slip", label: "Tool: Slip", shortcut: "Y", run: () => setEditTool("slip") },
      { id: "tool-slide", label: "Tool: Slide", shortcut: "U", run: () => setEditTool("slide") },
      { id: "tool-roll", label: "Tool: Roll", shortcut: "N", run: () => setEditTool("roll") },
      { id: "tool-hand", label: "Tool: Hand", shortcut: "H", run: () => setEditTool("hand") },
      { id: "tool-zoom", label: "Tool: Zoom", shortcut: "Z", run: () => setEditTool("zoom") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  // Magnetic snap targets: all clip edges + timeline start + playhead + markers + SFX
  const snapPoints = useMemo(
    () =>
      collectSnapPoints({
        clips: viewClips,
        starts,
        total,
        texts: nestedEditing ? [] : texts,
        music: nestedEditing ? null : music,
        musicTracks: nestedEditing ? [] : musicTracks,
        markers: nestedEditing ? [] : markers,
      }),
    [viewClips, starts, total, texts, music, musicTracks, markers, nestedEditing],
  );

  const snapSec = useCallback(
    (t: number) => {
      if (!snapEnabled) return Math.max(0, t);
      // Magnetic mode: wider pull so edges auto-close while dragging.
      const threshold = (magnetic ? 22 : 8) / pxPerSec;
      return snapToPoints(t, snapPoints, threshold, [curRef.current]);
    },
    [snapEnabled, magnetic, pxPerSec, snapPoints],
  );

  // Linked A/V: keep detached music lane glued to its source clip.
  useEffect(() => {
    if (nestedEditing) return;
    if (!music?.linkedClipId) return;
    const i = viewClips.findIndex((c) => c.id === music.linkedClipId);
    if (i < 0) return;
    const clip = viewClips[i];
    const start = starts[i] ?? 0;
    const nextIn = clip.inPoint;
    const nextOut = clip.outPoint;
    if (
      Math.abs(music.start - start) < 1e-4 &&
      Math.abs(music.inPoint - nextIn) < 1e-4 &&
      Math.abs(music.outPoint - nextOut) < 1e-4
    ) {
      return;
    }
    setMusic((m) =>
      m && m.linkedClipId === clip.id
        ? { ...m, start, inPoint: nextIn, outPoint: nextOut }
        : m,
    );
  }, [viewClips, starts, music?.linkedClipId, music?.start, music?.inPoint, music?.outPoint, nestedEditing]);

  useEffect(() => {
    if (!showGrowthHub) return;
    void (async () => {
      try {
        const res = await fetch(`/api/editor/project/${project.id}`);
        const data = await res.json();
        if (res.ok && data.project?.comments) {
          setReviewComments(data.project.comments as ReviewComment[]);
        }
      } catch {
        // ignore
      }
    })();
  }, [showGrowthHub, project.id]);

  // Linked A/V for extra musicTracks lanes
  useEffect(() => {
    if (nestedEditing) return;
    setMusicTracks((prev) => {
      if (!prev.some((m) => m.linkedClipId)) return prev;
      let changed = false;
      const next = prev.map((m) => {
        if (!m.linkedClipId) return m;
        const i = viewClips.findIndex((c) => c.id === m.linkedClipId);
        if (i < 0) return m;
        const clip = viewClips[i];
        const start = starts[i] ?? 0;
        if (
          Math.abs(m.start - start) < 1e-4 &&
          Math.abs(m.inPoint - clip.inPoint) < 1e-4 &&
          Math.abs(m.outPoint - clip.outPoint) < 1e-4
        ) {
          return m;
        }
        changed = true;
        return { ...m, start, inPoint: clip.inPoint, outPoint: clip.outPoint };
      });
      return changed ? next : prev;
    });
  }, [viewClips, starts, nestedEditing]);

  function moveClipToLane(clipId: string, lane: number) {
    const clip = viewClips.find((c) => c.id === clipId);
    if (!clip) return;
    const i = viewClips.findIndex((c) => c.id === clipId);
    const start = starts[i] ?? current;
    if (lane === 0) {
      setViewClips((prev) => {
        const rest = prev.filter((c) => c.id !== clipId);
        const mains = rest.filter((c) => clipLane(c) === 0);
        const ovs = rest.filter((c) => clipLane(c) > 0);
        const moved: TimelineClip = { ...clip, lane: 0, tlStart: undefined };
        return [...mains, moved, ...ovs];
      });
      pushToast("Moved to V1 Main", "success");
    } else {
      setViewClips((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, lane, tlStart: start, transition: "none" as const } : c,
        ),
      );
      pushToast(lane >= 2 ? "Moved to V3 Overlay" : "Moved to V2 Overlay", "success");
    }
  }

  const timelineWidth = Math.max(320, scrubTotal * pxPerSec);

  // Keep virtualization viewport in sync on resize
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setViewScroll({ left: el.scrollLeft, width: el.clientWidth });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll the timeline so the playhead stays visible during playback
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !playing) return;
    const x = current * pxPerSec;
    const view = el.scrollLeft;
    const w = el.clientWidth;
    if (x < view + 40 || x > view + w - 80) {
      el.scrollLeft = Math.max(0, x - w * 0.4);
    }
  }, [current, playing, pxPerSec]);

  // Ctrl + mouse wheel to zoom around the cursor (native, non-passive)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const tAtCursor = cursorX / pxPerSec;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clamp(Math.round(pxPerSec * factor), 24, 400);
      setPxPerSec(next);
      requestAnimationFrame(() => {
        const el2 = trackRef.current;
        if (el2) el2.scrollLeft = Math.max(0, tAtCursor * next - (e.clientX - rect.left));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pxPerSec]);


  const panelCtx = {
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
    demoKey,
    setDemoKey,
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
    onToggleProxy: () => setUseProxy((v) => !v),
    snapEnabled,
    setSnapEnabled,
    magnetic,
    setMagnetic,
    rippleEnabled,
    setRippleEnabled,
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
  };


  return (
    <div className="studio-overlay" role="dialog" aria-modal="true">
      <div
        className={`studio-shell dark cc-shell${floatBin ? " float-bin" : ""}${floatInspector ? " float-inspector" : ""}${uiLarge ? " ui-large" : ""}`}
        data-tool={editTool}
      >
        <StudioTopBar
          projectName={project.name || "Untitled"}
          aspect={aspect}
          setAspect={setAspect}
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
          onAddMarker={addMarker}
          onAddAdjustment={addAdjustmentLayer}
          nestDepth={nestPath.length}
          onExitCompound={exitCompound}
          useProxy={useProxy}
          onToggleProxy={() => setUseProxy((v) => !v)}
          workspace={workspace}
          onWorkspace={applyWorkspace}
          onOpenCommands={() => setCmdOpen(true)}
          uiLarge={uiLarge}
          onToggleUiLarge={() => setUiLarge((v) => !v)}
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
                  if (!selectedClip) {
                    pushToast("Select a clip first", "info");
                    return;
                  }
                  addEffect(selectedClip.id, kind);
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
                  if (selectedClip) patchClip(selectedClip.id, { transitionDuration: d });
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
                  if (!selectedClip) {
                    pushToast("Select a clip first", "info");
                    return;
                  }
                  patchColor(selectedClip.id, { ...grade, preset: id });
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
                    pushToast(`${label} applied`, "success");
                    return;
                  }
                  insertTextStyle({ anim, text: label, size: 0.09, bold: true }, label);
                }}
              />
            )}
            {sidebarTab === "templates" && (
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
                setSidebarTab("transitions");
                setTab("clip");
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
            useProxy,
            guidesThirds: guides.thirds,
            onTogglePlay: togglePlay,
            onToggleMute: toggleMute,
            onToggleProxy: () => setUseProxy((v) => !v),
            onToggleGuides: () =>
              setGuides((g) => ({ ...g, thirds: !g.thirds })),
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

        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          commands={studioCommands}
        />

        <UndoHistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          entries={historyEntries}
          onJump={(i) => {
            jumpHistory(i);
            setHistoryOpen(false);
          }}
        />


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
          onSavePack={(pack) => {
            setGrowthPack(pack);
            setViralScore(pack.score);
          }}
          onSchedule={(ev) => {
            setCalendarEvents((prev) => [...prev, ev]);
            pushToast("Scheduled locally", "success");
          }}
          onUpsertCalendarEvent={(ev) => {
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
          }}
          onDeleteCalendarEvent={(id) => {
            setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
            pushToast("Event removed", "info");
          }}
          onSyncCalendarFromJobs={syncCalendarFromJobs}
          onBrandKit={(kit) => {
            setBrandKit(kit);
            pushToast("Brand kit saved", "success");
          }}
          onApplyBrandKit={applyBrandKitToTimeline}
          onGenerateThumb={generateGrowthThumb}
          onBatchExport={batchExportAspects}
          onHookFix={applyHookFix}
          onApplyChapters={applyChaptersAsMarkers}
          onApplyTranslation={(segs, lang) => {
            // Drop translated lines as caption text overlays near segment starts
            const added = segs.slice(0, 12).map((s) => {
              const t = {
                ...defaultText(uid("dub"), s.start),
                text: s.text,
                size: 0.055,
                y: 0.82,
                bold: true,
                stroke: 2,
                strokeColor: "#000",
              };
              return t;
            });
            setTexts((prev) => [...prev, ...added]);
            setSidebarTab("ai");
            pushToast(`${lang} captions added (${added.length})`, "success");
          }}
          onApplyDubTracks={applyDubTracks}
          onCloudPull={hydrateFromCloudProject}
          onCreateShareLink={createShareLink}
          onRunAnalyze={() => runAiAnalyze()}
          onRecommendationAction={(action) => {
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
          }}
        />

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
