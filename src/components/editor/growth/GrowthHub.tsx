"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BrandKit,
  CalendarEvent,
  GrowthPack,
  ViralScorecard,
} from "@/lib/growth-types";
import type {
  AnalyticsSummary,
  ApprovalItem,
  CloudVersionEntry,
  DubTrackPiece,
  OAuthConnection,
  PublishPlatform,
  TranslateLang,
} from "@/lib/platform-types";
import type { AspectRatio } from "@/lib/types";
import type { ReviewComment, Project } from "@/lib/editor-types";
import {
  TEAM_ROLES,
  canCloudSync,
  canRequestApproval,
  canResolveApproval,
  loadTeamName,
  loadTeamRole,
  saveTeamName,
  saveTeamRole,
  type TeamRole,
} from "@/lib/team-roles";
import { resolveSuggestedPostTime } from "@/lib/suggested-post-time";
import {
  THUMBNAIL_LAYOUT_PRESETS,
  type ThumbnailLayoutPreset,
} from "@/lib/thumbnail-layout";
import { ViralScorecardView } from "@/components/editor/growth/ViralScorecard";
import { GrowthRecommendations } from "@/components/editor/growth/GrowthRecommendations";
import type { GrowthRecAction } from "@/lib/growth-recommendations";
import { formatYoutubeChaptersBlock } from "@/lib/growth-chapters";

type ScheduleJob = {
  id: string;
  title: string;
  platform: string;
  dueAt: string;
  status: string;
  error?: string;
  remoteUrl?: string;
  caption?: string;
};

type ExportJobLite = {
  id: string;
  status: string;
  error?: string;
  downloadUrl?: string;
  previewUrl?: string;
  format?: string;
  createdAt?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  duration: number;
  videoTitle?: string;
  transcriptSnippet?: string;
  initialScore?: ViralScorecard | null;
  initialPack?: GrowthPack | null;
  brandKit?: BrandKit | null;
  calendarEvents?: CalendarEvent[];
  reviewComments?: ReviewComment[];
  exportJobs?: ExportJobLite[];
  onSavePack?: (pack: GrowthPack) => void;
  onSchedule?: (ev: CalendarEvent) => void;
  /** Create or update a planner draft/event in project spec. */
  onUpsertCalendarEvent?: (ev: CalendarEvent) => void;
  /** Remove a planner event from project spec. */
  onDeleteCalendarEvent?: (id: string) => void;
  /** Sync calendar event statuses from publish queue. */
  onSyncCalendarFromJobs?: (
    jobs: { title: string; dueAt: string; status: string; platform: string }[],
  ) => void;
  onBrandKit?: (kit: BrandKit) => void;
  /** Apply kit colors/fonts to timeline texts (+ logo sticker). */
  onApplyBrandKit?: (kit: BrandKit) => void;
  onHookFix?: (id: string) => void;
  onApplyTranslation?: (
    segments: { start: number; end: number; text: string }[],
    lang: string,
  ) => void;
  /** Apply full TTS dub pieces as music-lane tracks; mute dialogue when true. */
  onApplyDubTracks?: (tracks: DubTrackPiece[], muteDialogue: boolean) => void;
  /** Drop growth pack chapters as timeline markers. */
  onApplyChapters?: (chapters: string[]) => void;
  /** Generate a branded thumbnail PNG; returns public URL. */
  onGenerateThumb?: (
    headline: string,
    layout?: ThumbnailLayoutPreset,
  ) => Promise<string | null>;
  /** Queue exports for multiple aspects. */
  onBatchExport?: (aspects: AspectRatio[]) => void | Promise<void>;
  /** Hydrate Studio after cloud pull. */
  onCloudPull?: (project: Project) => void;
  /** Copy review share link (Phase 13). */
  onCreateShareLink?: () => void | Promise<void>;
  /** Image assets available as brand logos. */
  logoAssets?: { id: string; name: string; url: string }[];
  exportHistoryCount?: number;
  /** Navigate Studio sidebar from recommendation chips */
  onRecommendationAction?: (action: GrowthRecAction) => void;
  /** Run AI analyze from empty states */
  onRunAnalyze?: () => void | Promise<void>;
};

const LANG_LABELS: Record<TranslateLang, string> = {
  ar: "Arabic",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
};

function GrowthSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="cc-growth-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="cc-skeleton-line"
          style={{ width: `${60 + (i % 4) * 12}%` }}
        />
      ))}
    </div>
  );
}

function GrowthEmpty({
  title,
  hint,
  cta,
  onCta,
  busy,
}: {
  title: string;
  hint: string;
  cta?: string;
  onCta?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="cc-growth-empty">
      <p className="cc-growth-empty-title">{title}</p>
      <p className="cc-lib-hint">{hint}</p>
      {cta && onCta && (
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={onCta}
          aria-label={cta}
        >
          {busy ? "Working…" : cta}
        </button>
      )}
    </div>
  );
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

const PLATFORMS: PublishPlatform[] = [
  "youtube",
  "tiktok",
  "instagram",
  "linkedin",
  "x",
];

export function GrowthHub({
  open,
  onClose,
  projectId,
  duration,
  videoTitle,
  transcriptSnippet,
  initialScore,
  initialPack,
  brandKit,
  calendarEvents = [],
  reviewComments = [],
  onSavePack,
  onSchedule,
  onUpsertCalendarEvent,
  onDeleteCalendarEvent,
  onSyncCalendarFromJobs,
  onBrandKit,
  onApplyBrandKit,
  onHookFix,
  onApplyTranslation,
  onApplyDubTracks,
  onApplyChapters,
  onGenerateThumb,
  onBatchExport,
  onCloudPull,
  onCreateShareLink,
  logoAssets = [],
  exportJobs = [],
  exportHistoryCount = 0,
  onRecommendationAction,
  onRunAnalyze,
}: Props) {
  const [pack, setPack] = useState<GrowthPack | null>(initialPack ?? null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<
    | "score"
    | "copy"
    | "thumbs"
    | "publish"
    | "calendar"
    | "brand"
    | "analytics"
    | "dub"
    | "cloud"
  >("score");
  const [platform, setPlatform] = useState<
    "tiktok" | "youtube" | "instagram" | "shorts" | "linkedin" | "x"
  >("tiktok");
  const [copied, setCopied] = useState("");
  const [kit, setKit] = useState<BrandKit>(
    brandKit || {
      primary: "#12d6a0",
      secondary: "#0b1f1a",
      accent: "#f59e0b",
      fontHeading: "Impact",
      fontBody: "Arial",
    },
  );
  const [connections, setConnections] = useState<
    (OAuthConnection & { configured?: boolean })[]
  >([]);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [dubLang, setDubLang] = useState<TranslateLang>("ar");
  const [dubBusy, setDubBusy] = useState(false);
  const [dubPreview, setDubPreview] = useState("");
  const [dubProgress, setDubProgress] = useState("");
  const [dubMaxSegments, setDubMaxSegments] = useState(10);
  const [analyzing, setAnalyzing] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [cloudMsg, setCloudMsg] = useState("");
  const [cloudVersions, setCloudVersions] = useState<CloudVersionEntry[]>([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [notifs, setNotifs] = useState<
    { id: string; title: string; body: string; read: boolean; createdAt: string }[]
  >([]);
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([]);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbLayout, setThumbLayout] = useState<ThumbnailLayoutPreset>("bold-center");
  const [plannerTitle, setPlannerTitle] = useState("");
  const [plannerDate, setPlannerDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [plannerPlatform, setPlannerPlatform] = useState("tiktok");
  const [plannerStatus, setPlannerStatus] = useState<CalendarEvent["status"]>("draft");
  const [plannerEditId, setPlannerEditId] = useState<string | null>(null);
  const [batchMsg, setBatchMsg] = useState("");
  const [analyticsMsg, setAnalyticsMsg] = useState("");
  const [teamRole, setTeamRole] = useState<TeamRole>("editor");
  const [teamName, setTeamName] = useState("Editor");
  const [muteDialogue, setMuteDialogue] = useState(true);
  const [ytPrivacy, setYtPrivacy] = useState<"public" | "unlisted" | "private">(
    "unlisted",
  );

  useEffect(() => {
    setTeamRole(loadTeamRole());
    setTeamName(loadTeamName());
  }, []);

  const refreshNotifs = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notifications?projectId=${encodeURIComponent(projectId)}`,
      );
      const data = await res.json();
      if (res.ok) setNotifs(data.notifications || []);
    } catch {
      // ignore
    }
  }, [projectId]);

  const refreshSchedule = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/publish/schedule?projectId=${encodeURIComponent(projectId)}`,
      );
      const data = await res.json();
      if (res.ok) {
        const jobs = (data.jobs || []) as ScheduleJob[];
        setScheduleJobs(jobs);
        onSyncCalendarFromJobs?.(jobs);
      }
    } catch {
      // ignore
    }
  }, [projectId, onSyncCalendarFromJobs]);

  const loadPack = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          duration,
          videoTitle,
          transcriptSnippet,
          score: initialScore || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggest failed");
      setPack(data.pack as GrowthPack);
      onSavePack?.(data.pack as GrowthPack);
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, [projectId, duration, videoTitle, transcriptSnippet, initialScore, onSavePack]);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/status");
      const data = await res.json();
      if (res.ok) setConnections(data.connections || []);
    } catch {
      // ignore
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (res.ok) setAnalytics(data as AnalyticsSummary);
    } catch {
      // ignore
    }
  }, [projectId]);

  const refreshApprovals = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/cloud?projectId=${encodeURIComponent(projectId)}&approvals=1`,
      );
      const data = await res.json();
      if (res.ok) setApprovals(data.approvals || []);
    } catch {
      // ignore
    }
  }, [projectId]);

  const refreshCloudVersions = useCallback(async () => {
    setVersionsBusy(true);
    try {
      const res = await fetch(
        `/api/cloud?projectId=${encodeURIComponent(projectId)}&versions=1`,
      );
      const data = await res.json();
      if (res.ok) setCloudVersions(data.versions || []);
    } catch {
      // ignore
    } finally {
      setVersionsBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    if (initialPack) setPack(initialPack);
    else void loadPack();
    void refreshConnections();
    void refreshAnalytics();
    void refreshApprovals();
    void refreshNotifs();
    void refreshSchedule();
    void fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process" }),
    });
  }, [open, initialPack, loadPack, refreshConnections, refreshAnalytics, refreshApprovals, refreshNotifs, refreshSchedule]);

  useEffect(() => {
    if (brandKit) setKit(brandKit);
  }, [brandKit]);

  useEffect(() => {
    if (open && tab === "cloud") void refreshCloudVersions();
  }, [open, tab, refreshCloudVersions]);

  if (!open) return null;

  const score = pack?.score || initialScore;
  const titles =
    pack?.titles?.[platform] ||
    (platform === "linkedin" || platform === "x"
      ? pack?.titles?.youtube || []
      : []) ||
    [];

  function flashCopy(label: string, text: string) {
    copyText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  }

  function schedulePost(useSuggested?: boolean) {
    const hint = useSuggested
      ? pack?.score?.suggestedPostTime || score?.suggestedPostTime
      : undefined;
    const d = useSuggested
      ? resolveSuggestedPostTime(hint)
      : (() => {
          const x = new Date();
          x.setDate(x.getDate() + 1);
          x.setHours(18, 0, 0, 0);
          return x;
        })();
    const date = d.toISOString().slice(0, 10);
    const dueAt = d.toISOString();
    const pubPlatform =
      platform === "shorts"
        ? "youtube"
        : platform === "instagram"
          ? "instagram"
          : platform === "tiktok"
            ? "tiktok"
            : platform === "linkedin"
              ? "linkedin"
              : platform === "x"
                ? "x"
                : "youtube";
    const ev: CalendarEvent = {
      id: `cal-${Date.now()}`,
      date,
      title: titles[0] || videoTitle || "Scheduled clip",
      platform,
      status: "scheduled",
    };
    const caption = [
      ev.title,
      pack?.description,
      (pack?.hashtags?.[platform] || pack?.hashtags?.tiktok || []).join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    onSchedule?.(ev);
    void fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enqueue",
        projectId,
        platform: pubPlatform,
        title: ev.title,
        description: pack?.description,
        caption,
        dueAt,
      }),
    }).then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        setPublishMsg(
          useSuggested
            ? `Queued at suggested time · ${d.toLocaleString()}`
            : `Queued for ${d.toLocaleString()}`,
        );
      } else setPublishMsg(data.error || "Schedule enqueue failed");
    });
    void fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process" }),
    }).then(() => void refreshSchedule());
    setTab("calendar");
  }

  async function cancelScheduleJob(id: string) {
    await fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id }),
    });
    void refreshSchedule();
  }

  async function retryScheduleJob(id: string) {
    await fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", id }),
    });
    void fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process" }),
    }).then(() => void refreshSchedule());
  }

  function resetPlannerForm() {
    setPlannerEditId(null);
    setPlannerTitle("");
    setPlannerDate(new Date().toISOString().slice(0, 10));
    setPlannerPlatform("tiktok");
    setPlannerStatus("draft");
  }

  function startEditPlanner(ev: CalendarEvent) {
    setPlannerEditId(ev.id);
    setPlannerTitle(ev.title);
    setPlannerDate(ev.date);
    setPlannerPlatform(ev.platform || "tiktok");
    setPlannerStatus(ev.status);
  }

  function savePlannerEvent() {
    const title = plannerTitle.trim() || videoTitle || "Untitled draft";
    const ev: CalendarEvent = {
      id: plannerEditId || `cal-${Date.now()}`,
      date: plannerDate,
      title,
      platform: plannerPlatform,
      status: plannerStatus,
    };
    onUpsertCalendarEvent?.(ev);
    if (plannerStatus === "scheduled") onSchedule?.(ev);
    resetPlannerForm();
    setPublishMsg(plannerEditId ? "Planner event updated" : "Draft saved to project");
  }

  function deletePlannerEvent(id: string) {
    onDeleteCalendarEvent?.(id);
    if (plannerEditId === id) resetPlannerForm();
  }

  function queueStatusLabel(status: string) {
    switch (status) {
      case "scheduled":
        return "Scheduled";
      case "publishing":
        return "Publishing…";
      case "done":
        return "Posted";
      case "error":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  }

  async function generateAbThumbs() {
    if (!pack || !onGenerateThumb) return;
    setThumbBusy(true);
    try {
      const ideas = pack.thumbnailIdeas.slice(0, 3);
      const results: NonNullable<GrowthPack["abThumbs"]> = [];
      for (const idea of ideas) {
        const url = await onGenerateThumb(idea.headline, thumbLayout);
        if (url) {
          results.push({
            id: `ab-${idea.id}-${Date.now()}`,
            ideaId: idea.id,
            headline: idea.headline,
            url,
          });
        }
      }
      if (!results.length) {
        setPublishMsg("Could not generate thumbnails");
        return;
      }
      const next = { ...pack, abThumbs: results };
      setPack(next);
      onSavePack?.(next);
      setPublishMsg(`Generated ${results.length} A/B thumbnails`);
    } finally {
      setThumbBusy(false);
    }
  }

  function pickWinner(thumbId: string) {
    if (!pack?.abThumbs) return;
    const next = {
      ...pack,
      abThumbs: pack.abThumbs.map((t) => ({
        ...t,
        winner: t.id === thumbId,
      })),
    };
    setPack(next);
    onSavePack?.(next);
    setPublishMsg("Winner saved to growth pack");
  }

  async function runBatchExport() {
    if (!onBatchExport) return;
    setBatchMsg("Queuing 9:16 · 1:1 · 16:9…");
    try {
      await onBatchExport(["9:16", "1:1", "16:9"]);
      setBatchMsg("3 aspect exports queued — check Deliver queue");
    } catch (err) {
      setBatchMsg(err instanceof Error ? err.message : "Batch export failed");
    }
  }

  async function connectPlatform(p: PublishPlatform) {
    setPublishMsg("");
    try {
      const res = await fetch("/api/oauth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: p }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url as string;
        return;
      }
      setPublishMsg(data.error || data.hint || "Could not start OAuth");
    } catch (err) {
      setPublishMsg(err instanceof Error ? err.message : "Connect failed");
    }
  }

  async function disconnectPlatform(p: PublishPlatform) {
    await fetch(`/api/oauth/status?platform=${p}`, { method: "DELETE" });
    void refreshConnections();
  }

  async function publishNow(p: PublishPlatform) {
    setPublishing(true);
    setPublishMsg("");
    try {
      const title =
        p === "tiktok"
          ? pack?.titles?.tiktok?.[0]
          : p === "instagram"
            ? pack?.titles?.instagram?.[0]
            : p === "linkedin"
              ? pack?.titles?.linkedin?.[0] || pack?.titles?.youtube?.[0]
              : p === "x"
                ? pack?.titles?.x?.[0] || pack?.titles?.youtube?.[0]
                : pack?.titles?.youtube?.[0];
      const tags =
        pack?.hashtags?.[p] ||
        (p === "linkedin" || p === "x" ? pack?.hashtags?.youtube : null) ||
        pack?.hashtags?.tiktok ||
        [];
      const winner = pack?.abThumbs?.find((t) => t.winner);
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          platform: p,
          title: title || videoTitle,
          description: [pack?.description, tags.join(" ")].filter(Boolean).join("\n\n"),
          privacy: p === "youtube" ? ytPrivacy : "unlisted",
          thumbnailUrl: p === "youtube" ? winner?.url : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.connect && p === "youtube") {
          setPublishMsg("Connect YouTube first");
          return;
        }
        throw new Error(data.error || "Publish failed");
      }
      if (data.mode === "pack") {
        if (data.caption) {
          try {
            await navigator.clipboard.writeText(String(data.caption));
          } catch {
            // ignore
          }
        }
        setPublishMsg(
          data.message ||
            `Pack ready — caption copied${data.downloadUrl ? ". Download export to post." : ""}`,
        );
        if (data.downloadUrl) window.open(String(data.downloadUrl), "_blank");
        if (data.openUrl) {
          setTimeout(() => window.open(String(data.openUrl), "_blank"), 400);
        }
      } else {
        setPublishMsg(
          `Published: ${data.remoteUrl || data.remoteId}${data.thumbApplied ? " · thumbnail set" : ""}`,
        );
      }
      void refreshAnalytics();
    } catch (err) {
      setPublishMsg(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function cloudAction(
    action: "push" | "pull" | "request" | "restore",
    opts?: { commentId?: string; title?: string; note?: string; revision?: number },
  ) {
    setCloudMsg("");
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectId,
          title: opts?.title || "Ready for review",
          note: opts?.note || "Please approve this cut",
          author: teamName,
          role: teamRole,
          commentId: opts?.commentId,
          revision: opts?.revision,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cloud failed");
      if (action === "push") {
        setCloudMsg(`Synced rev ${data.meta?.revision}`);
        void refreshCloudVersions();
      } else if (action === "pull") {
        if (data.project && onCloudPull) {
          onCloudPull(data.project as Project);
          setCloudMsg("Pulled cloud snapshot — timeline updated");
        } else {
          setCloudMsg("Pulled cloud snapshot");
        }
      } else if (action === "restore") {
        if (data.project && onCloudPull) {
          onCloudPull(data.project as Project);
          setCloudMsg(`Restored cloud rev ${opts?.revision ?? data.revision}`);
        } else {
          setCloudMsg(`Restored rev ${opts?.revision ?? data.revision}`);
        }
        void refreshCloudVersions();
      } else setCloudMsg("Approval requested");
      void refreshApprovals();
    } catch (err) {
      setCloudMsg(err instanceof Error ? err.message : "Cloud failed");
    }
  }

  async function runTranslate(mode: "captions" | "sample" | "full") {
    setDubBusy(true);
    setDubPreview("");
    setDubProgress(
      mode === "full"
        ? `Translating + generating up to ${dubMaxSegments} TTS clips…`
        : mode === "sample"
          ? "Generating TTS preview…"
          : "Translating captions…",
    );
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          lang: dubLang,
          text: transcriptSnippet,
          dub: mode === "captions" ? false : mode,
          maxDubSegments: dubMaxSegments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translate failed");
      const segs = (data.segments || []) as {
        start: number;
        end: number;
        text: string;
      }[];
      setDubPreview(segs.map((s) => s.text).join(" ").slice(0, 280));
      onApplyTranslation?.(segs, dubLang);
      if (mode === "sample" && data.audioUrl) {
        const a = new Audio(data.audioUrl as string);
        void a.play().catch(() => {});
        setDubProgress("");
      }
      if (mode === "full") {
        const tracks = (data.dubTracks || []) as DubTrackPiece[];
        if (!tracks.length) throw new Error("No dub audio returned");
        onApplyDubTracks?.(tracks, muteDialogue);
        setDubPreview(
          `${tracks.length} dub clips placed on music lane · ${muteDialogue ? "dialogue muted" : "dialogue kept"}`,
        );
        setDubProgress(`Done — ${tracks.length} segment${tracks.length === 1 ? "" : "s"} dubbed`);
      } else {
        setDubProgress("");
      }
    } catch (err) {
      setDubPreview(err instanceof Error ? err.message : "Translate failed");
      setDubProgress("");
    } finally {
      setDubBusy(false);
    }
  }

  async function handleRunAnalyze() {
    if (!onRunAnalyze) return;
    setAnalyzing(true);
    try {
      await onRunAnalyze();
    } finally {
      setAnalyzing(false);
    }
  }

  function handleRecommendation(action: GrowthRecAction) {
    if (action === "dub") setTab("dub");
    else if (action === "thumbs") setTab("thumbs");
    else onRecommendationAction?.(action);
  }

  async function resolveAppr(id: string, action: "approve" | "reject") {
    const res = await fetch("/api/cloud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        approvalId: id,
        resolvedBy: teamName,
        role: teamRole,
      }),
    });
    const data = await res.json();
    if (!res.ok) setCloudMsg(data.error || "Resolve failed");
    void refreshApprovals();
  }

  return (
    <div className="cc-growth-overlay" role="dialog" aria-modal aria-label="Growth Hub">
      <div className="cc-growth-modal">
        <header className="cc-growth-head">
          <div>
            <h2>Growth Hub</h2>
            <p>Publish, analytics, dubs, and cloud sync</p>
          </div>
          <div className="cc-growth-head-actions">
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => void loadPack()}
              aria-label="Refresh growth pack"
            >
              {loading ? "Generating…" : "Refresh pack"}
            </button>
            <button type="button" className="btn" onClick={onClose} aria-label="Close Growth Hub">
              Close
            </button>
          </div>
        </header>

        <nav className="cc-growth-tabs">
          {(
            [
              ["score", "Score"],
              ["copy", "Copy"],
              ["thumbs", "Thumbs"],
              ["publish", "Publish"],
              ["dub", "Dub"],
              ["calendar", "Calendar"],
              ["brand", "Brand"],
              ["analytics", "Analytics"],
              ["cloud", "Cloud"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "on" : ""}
              onClick={() => setTab(id)}
              aria-label={`${label} tab`}
              aria-selected={tab === id}
              role="tab"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="cc-growth-body" role="tabpanel">
          {loading && (tab === "score" || tab === "copy" || tab === "thumbs") && (
            <GrowthSkeleton rows={tab === "score" ? 6 : 4} />
          )}

          {!loading && tab === "score" && score && (
            <>
              <ViralScorecardView
                score={score}
                onHookFix={
                  onHookFix as
                    | ((id: import("@/lib/growth-types").HookFixId) => void)
                    | undefined
                }
              />
              <GrowthRecommendations
                score={score}
                onAction={handleRecommendation}
                onHubTab={(t) => setTab(t)}
              />
            </>
          )}
          {!loading && tab === "score" && !score && (
            <GrowthEmpty
              title="No score yet"
              hint="Analyze your timeline to get a viral scorecard and recommendations."
              cta={onRunAnalyze ? "Run Analyze" : "Refresh pack"}
              onCta={onRunAnalyze ? () => void handleRunAnalyze() : () => void loadPack()}
              busy={analyzing || loading}
            />
          )}

          {!loading && tab === "copy" && pack && (
            <div className="cc-growth-copy">
              <div className="cc-platform-row">
                {(
                  ["tiktok", "youtube", "instagram", "shorts", "linkedin", "x"] as const
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={platform === p ? "cc-hook-chip on" : "cc-hook-chip"}
                    onClick={() => setPlatform(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <h4>Titles</h4>
              <ul className="cc-title-list">
                {titles.map((t) => (
                  <li key={t}>
                    <span>{t}</span>
                    <button type="button" className="btn" onClick={() => flashCopy("title", t)}>
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
              <h4>Description</h4>
              <pre className="cc-growth-pre">{pack.description}</pre>
              <button type="button" className="btn" onClick={() => flashCopy("desc", pack.description)}>
                Copy description
              </button>
              <h4>CTA</h4>
              <p>{pack.cta}</p>
              <button type="button" className="btn" onClick={() => flashCopy("cta", pack.cta)}>
                Copy CTA
              </button>
              <h4>Hashtags</h4>
              <p className="cc-hash">
                {(pack.hashtags[platform] || pack.hashtags.tiktok || []).join(" ")}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => flashCopy("tags", (pack.hashtags[platform] || []).join(" "))}
              >
                Copy hashtags
              </button>
              <div className="cc-platform-row" style={{ marginTop: "0.75rem", gap: "0.45rem" }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const platforms = [
                      "tiktok",
                      "youtube",
                      "instagram",
                      "shorts",
                      "linkedin",
                      "x",
                    ] as const;
                    const blocks = platforms.map((p) => {
                      const titlesList = pack.titles?.[p] || pack.titles?.tiktok || [];
                      const tags = (pack.hashtags[p] || pack.hashtags.tiktok || []).join(" ");
                      return [
                        `## ${p.toUpperCase()}`,
                        titlesList[0] ? `Title: ${titlesList[0]}` : "",
                        pack.description ? `Description:\n${pack.description}` : "",
                        pack.cta ? `CTA: ${pack.cta}` : "",
                        tags ? `Hashtags: ${tags}` : "",
                        pack.seoKeywords?.length
                          ? `SEO: ${pack.seoKeywords.join(", ")}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                    });
                    const text = `# ${videoTitle || "Clippers"} — Social pack\n\n${blocks.join("\n\n")}\n`;
                    flashCopy("social pack", text);
                    try {
                      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `social-pack-${Date.now()}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      // clipboard already handled
                    }
                  }}
                >
                  Download social pack
                </button>
              </div>
              {pack.chapters?.length ? (
                <>
                  <h4>Chapters</h4>
                  <ul className="cc-ai-list">
                    {pack.chapters.map((ch) => (
                      <li key={ch}>
                        <button
                          type="button"
                          className="cc-ai-item"
                          onClick={() => flashCopy("ch", ch)}
                        >
                          <span className="cc-ai-emoji">⏱</span>
                          <span className="cc-ai-meta">
                            <strong>{ch}</strong>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!onApplyChapters}
                    onClick={() => onApplyChapters?.(pack.chapters)}
                  >
                    Apply chapters as markers
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginLeft: "0.45rem" }}
                    onClick={() => {
                      const block = formatYoutubeChaptersBlock(pack.chapters);
                      if (!block) {
                        flashCopy("ch", pack.chapters.join("\n"));
                        return;
                      }
                      flashCopy("yt chapters", block);
                    }}
                  >
                    Copy YouTube chapters
                  </button>
                </>
              ) : null}
              {copied && <p className="cc-copied">Copied {copied}</p>}
            </div>
          )}

          {!loading && tab === "copy" && !pack && (
            <GrowthEmpty
              title="No copy pack yet"
              hint="Generate titles, hashtags, and descriptions for each platform."
              cta="Generate pack"
              onCta={() => void loadPack()}
              busy={loading}
            />
          )}

          {!loading && tab === "thumbs" && pack && (
            <div className="cc-thumb-panel">
              <p className="cc-lib-hint">Layout preset — face-biased crop when a person is detected.</p>
              <div className="cc-platform-row" style={{ marginBottom: "0.65rem" }}>
                {THUMBNAIL_LAYOUT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    className={thumbLayout === p.id ? "cc-hook-chip on" : "cc-hook-chip"}
                    onClick={() => setThumbLayout(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="cc-ai-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={thumbBusy || !onGenerateThumb}
                  onClick={() => void generateAbThumbs()}
                >
                  {thumbBusy ? "Generating…" : "Generate A/B thumbs"}
                </button>
                {onBatchExport && (
                  <button type="button" className="btn" onClick={() => void runBatchExport()}>
                    Batch export 3 aspects
                  </button>
                )}
              </div>
              {batchMsg && <p className="cc-copied">{batchMsg}</p>}
              {pack.abThumbs?.length ? (
                <div className="cc-thumb-grid">
                  {pack.abThumbs.map((th) => (
                    <div
                      key={th.id}
                      className={`cc-thumb-card ${th.winner ? "winner" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={th.url} alt={th.headline} className="cc-thumb-img" />
                      <strong>{th.headline}</strong>
                      <div className="cc-platform-row">
                        <button
                          type="button"
                          className={th.winner ? "cc-hook-chip on" : "cc-hook-chip"}
                          onClick={() => pickWinner(th.id)}
                        >
                          {th.winner ? "Winner" : "Pick winner"}
                        </button>
                        <a className="cc-hook-chip" href={th.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cc-thumb-grid">
                  {pack.thumbnailIdeas.map((th) => (
                    <div key={th.id} className="cc-thumb-card">
                      <strong>{th.headline}</strong>
                      <span>{th.label}</span>
                      <em>{th.vibe}</em>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => flashCopy("thumb", th.headline)}
                      >
                        Copy headline
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && tab === "thumbs" && !pack && (
            <GrowthEmpty
              title="No thumbnail ideas yet"
              hint="Refresh the growth pack to get A/B thumbnail concepts."
              cta="Generate pack"
              onCta={() => void loadPack()}
              busy={loading}
            />
          )}

          {tab === "publish" && (
            <div className="cc-publish-shell">
              <p className="cc-lib-hint">
                YouTube uploads via OAuth (optional A/B winner thumbnail). Other platforms use
                Get pack — download + caption, no fake Connect.
              </p>
              <div className="cc-platform-row" style={{ marginBottom: "0.65rem" }}>
                <span className="cc-lib-hint">YouTube privacy:</span>
                {(["unlisted", "public", "private"] as const).map((pr) => (
                  <button
                    key={pr}
                    type="button"
                    className={ytPrivacy === pr ? "cc-hook-chip on" : "cc-hook-chip"}
                    onClick={() => setYtPrivacy(pr)}
                  >
                    {pr}
                  </button>
                ))}
              </div>
              {pack?.abThumbs?.some((t) => t.winner) && (
                <p className="cc-copied">A/B winner will be set as YouTube thumbnail on publish</p>
              )}
              <div className="cc-publish-grid">
                {PLATFORMS.map((p) => {
                  const c = connections.find((x) => x.platform === p);
                  const connected = Boolean(c?.connected);
                  const isYt = p === "youtube";
                  return (
                    <div key={p} className="cc-publish-card">
                      <strong>{p}</strong>
                      <span>
                        {isYt
                          ? connected
                            ? c?.accountName || "Connected"
                            : c?.configured
                              ? "Ready to connect"
                              : "Add Google env credentials"
                          : "Caption pack → manual post"}
                      </span>
                      <div className="cc-platform-row">
                        {isYt ? (
                          connected ? (
                            <>
                              <button
                                type="button"
                                className="cc-hook-chip on"
                                disabled={publishing}
                                onClick={() => void publishNow(p)}
                              >
                                {publishing ? "Uploading…" : "Publish"}
                              </button>
                              <button
                                type="button"
                                className="cc-hook-chip"
                                onClick={() => void disconnectPlatform(p)}
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="cc-hook-chip"
                              onClick={() => void connectPlatform(p)}
                            >
                              Connect
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="cc-hook-chip on"
                            disabled={publishing}
                            onClick={() => void publishNow(p)}
                          >
                            {publishing ? "…" : "Get pack"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {publishMsg && <p className="cc-copied">{publishMsg}</p>}
              {onCreateShareLink && (
                <div className="cc-ai-actions" style={{ marginTop: "0.65rem" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void onCreateShareLink()}
                  >
                    Copy share link
                  </button>
                </div>
              )}
              <div className="cc-ai-actions">
                <button type="button" className="btn primary" onClick={() => schedulePost(false)}>
                  Schedule tomorrow 18:00
                </button>
                <button type="button" className="btn" onClick={() => schedulePost(true)}>
                  Schedule at suggested time
                </button>
              </div>
              {(score?.suggestedPostTime || pack?.score?.suggestedPostTime) && (
                <p className="cc-lib-hint">
                  Suggested: {score?.suggestedPostTime || pack?.score?.suggestedPostTime}
                </p>
              )}
            </div>
          )}

          {tab === "dub" && (
            <div className="cc-dub-shell">
              <p className="cc-dub-disclaimer" role="note">
                Audio dub overlay — not lip-synced
              </p>
              <p className="cc-lib-hint">
                Translate captions (LLM when key set). Full dub writes TTS clips onto the music
                lane as timed segments (needs OPENAI_API_KEY).
              </p>
              <div className="cc-platform-row" role="group" aria-label="Dub language">
                {(["ar", "en", "es", "fr", "de", "pt", "hi", "ja", "ko"] as TranslateLang[]).map(
                  (l) => (
                    <button
                      key={l}
                      type="button"
                      className={dubLang === l ? "cc-hook-chip on" : "cc-hook-chip"}
                      onClick={() => setDubLang(l)}
                      aria-label={`Dub language ${LANG_LABELS[l]}`}
                      aria-pressed={dubLang === l}
                    >
                      {LANG_LABELS[l]}
                    </button>
                  ),
                )}
              </div>
              <label className="cc-dub-seg-count">
                <span>Max dub segments</span>
                <select
                  value={dubMaxSegments}
                  onChange={(e) => setDubMaxSegments(Number(e.target.value))}
                  disabled={dubBusy}
                  aria-label="Maximum dub segments"
                >
                  {[4, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} segments
                    </option>
                  ))}
                </select>
              </label>
              <label className="cc-dub-mute">
                <input
                  type="checkbox"
                  checked={muteDialogue}
                  onChange={(e) => setMuteDialogue(e.target.checked)}
                />
                Mute original dialogue when applying full dub
              </label>
              {dubBusy && dubProgress && (
                <p className="cc-dub-progress" aria-live="polite">
                  {dubProgress}
                </p>
              )}
              <div className="cc-ai-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={dubBusy}
                  onClick={() => void runTranslate("captions")}
                  aria-label="Translate captions"
                >
                  {dubBusy ? "Working…" : "Translate captions"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={dubBusy}
                  onClick={() => void runTranslate("sample")}
                  aria-label="Preview TTS sample"
                >
                  Preview TTS sample
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={dubBusy || !onApplyDubTracks}
                  onClick={() => void runTranslate("full")}
                  aria-label="Generate full dub on music lane"
                >
                  Full dub → music lane
                </button>
              </div>
              {dubPreview && <pre className="cc-growth-pre">{dubPreview}</pre>}
            </div>
          )}

          {tab === "calendar" && (
            <div className="cc-cal-shell">
              <h4>Content planner</h4>
              <p className="cc-lib-hint">
                Drafts save to your project. Set status to scheduled when ready to queue.
              </p>
              <div className="cc-planner-form">
                <label>
                  Title
                  <input
                    value={plannerTitle}
                    onChange={(e) => setPlannerTitle(e.target.value)}
                    placeholder={videoTitle || "Clip title"}
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={plannerDate}
                    onChange={(e) => setPlannerDate(e.target.value)}
                  />
                </label>
                <div className="cc-platform-row">
                  {(["tiktok", "youtube", "instagram", "linkedin", "x"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={plannerPlatform === p ? "cc-hook-chip on" : "cc-hook-chip"}
                      onClick={() => setPlannerPlatform(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="cc-platform-row">
                  {(["draft", "scheduled", "posted"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={plannerStatus === st ? "cc-hook-chip on" : "cc-hook-chip"}
                      onClick={() => setPlannerStatus(st)}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="cc-ai-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!onUpsertCalendarEvent}
                    onClick={savePlannerEvent}
                  >
                    {plannerEditId ? "Update event" : "Save draft"}
                  </button>
                  {plannerEditId && (
                    <button type="button" className="btn" onClick={resetPlannerForm}>
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>

              {calendarEvents.length > 0 && (
                <>
                  <h4 style={{ marginTop: "1rem" }}>Saved events</h4>
                  <ul className="cc-ai-list cc-planner-list">
                    {calendarEvents.map((ev) => (
                      <li key={ev.id}>
                        <div className="cc-ai-item cc-planner-row">
                          <span className="cc-ai-emoji">
                            {ev.status === "posted" ? "✓" : ev.status === "scheduled" ? "📅" : "📝"}
                          </span>
                          <span className="cc-ai-meta">
                            <strong>{ev.title}</strong>
                            <span>
                              {ev.date} · {ev.platform || "—"} ·{" "}
                              <em className={`cc-cal-ev ${ev.status}`}>{ev.status}</em>
                            </span>
                          </span>
                          <span className="cc-platform-row">
                            <button
                              type="button"
                              className="cc-hook-chip"
                              onClick={() => startEditPlanner(ev)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="cc-hook-chip"
                              onClick={() => deletePlannerEvent(ev.id)}
                            >
                              Delete
                            </button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h4 style={{ marginTop: "1rem" }}>This week</h4>
              <div className="cc-cal-grid">
                {Array.from({ length: 7 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - d.getDay() + i);
                  const key = d.toISOString().slice(0, 10);
                  const events = calendarEvents.filter((e) => e.date === key);
                  const jobs = scheduleJobs.filter((j) => j.dueAt.slice(0, 10) === key);
                  return (
                    <div key={key} className="cc-cal-day">
                      <strong>
                        {d.toLocaleDateString(undefined, { weekday: "short" })} {d.getDate()}
                      </strong>
                      {events.map((e) => (
                        <span key={e.id} className={`cc-cal-ev ${e.status}`}>
                          {e.title.slice(0, 28)}
                        </span>
                      ))}
                      {jobs.map((j) => (
                        <span key={j.id} className={`cc-cal-ev ${j.status}`}>
                          {j.platform}: {j.title.slice(0, 20)}
                        </span>
                      ))}
                      {!events.length && !jobs.length && <em className="cc-cal-empty">—</em>}
                    </div>
                  );
                })}
              </div>
              <h4 style={{ marginTop: "1rem" }}>Publish queue</h4>
              {!scheduleJobs.length && (
                <p className="cc-lib-hint">No scheduled jobs — use Publish → Schedule locally.</p>
              )}
              <ul className="cc-ai-list cc-queue-list">
                {scheduleJobs.map((j) => (
                  <li key={j.id}>
                    <div className="cc-queue-card">
                      <div className="cc-queue-head">
                        <strong>{j.title}</strong>
                        <span className={`cc-queue-badge ${j.status}`}>
                          {queueStatusLabel(j.status)}
                        </span>
                      </div>
                      <div className="cc-queue-meta">
                        <span className="cc-queue-platform">{j.platform}</span>
                        <span>{new Date(j.dueAt).toLocaleString()}</span>
                      </div>
                      {j.error && <p className="cc-queue-error">{j.error}</p>}
                      <div className="cc-platform-row">
                        {j.status === "scheduled" && (
                          <button
                            type="button"
                            className="cc-hook-chip"
                            onClick={() => void cancelScheduleJob(j.id)}
                          >
                            Cancel
                          </button>
                        )}
                        {(j.status === "error" || j.status === "cancelled") && (
                          <button
                            type="button"
                            className="cc-hook-chip on"
                            onClick={() => void retryScheduleJob(j.id)}
                          >
                            Retry
                          </button>
                        )}
                        {j.status === "done" && (
                          <>
                            {(j.caption || j.title) && (
                              <button
                                type="button"
                                className="cc-hook-chip"
                                onClick={() => flashCopy("pack", j.caption || j.title)}
                              >
                                Copy caption
                              </button>
                            )}
                            {j.remoteUrl && (
                              <a
                                className="cc-hook-chip on"
                                href={j.remoteUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn" onClick={() => void refreshSchedule()}>
                Refresh queue
              </button>
            </div>
          )}

          {tab === "brand" && (
            <div className="cc-brand-shell">
              <label>
                Primary
                <input
                  type="color"
                  value={kit.primary}
                  onChange={(e) => setKit({ ...kit, primary: e.target.value })}
                />
              </label>
              <label>
                Secondary
                <input
                  type="color"
                  value={kit.secondary}
                  onChange={(e) => setKit({ ...kit, secondary: e.target.value })}
                />
              </label>
              <label>
                Accent
                <input
                  type="color"
                  value={kit.accent}
                  onChange={(e) => setKit({ ...kit, accent: e.target.value })}
                />
              </label>
              <label>
                Heading font
                <input
                  value={kit.fontHeading}
                  onChange={(e) => setKit({ ...kit, fontHeading: e.target.value })}
                />
              </label>
              <label>
                Body font
                <input
                  value={kit.fontBody}
                  onChange={(e) => setKit({ ...kit, fontBody: e.target.value })}
                />
              </label>
              <label>
                Logo URL
                <input
                  value={kit.logoUrl || ""}
                  onChange={(e) => setKit({ ...kit, logoUrl: e.target.value })}
                  placeholder="https://… or pick from media below"
                />
              </label>
              {logoAssets.length > 0 && (
                <>
                  <p className="cc-lib-hint">From media bin</p>
                  <div className="cc-platform-row cc-logo-picks">
                    {logoAssets.slice(0, 8).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={
                          kit.logoUrl === a.url ? "cc-hook-chip on" : "cc-hook-chip"
                        }
                        title={a.name}
                        onClick={() => setKit({ ...kit, logoUrl: a.url })}
                      >
                        {a.name.slice(0, 14)}
                      </button>
                    ))}
                    {kit.logoUrl && (
                      <button
                        type="button"
                        className="cc-hook-chip"
                        onClick={() => setKit({ ...kit, logoUrl: undefined })}
                      >
                        Clear logo
                      </button>
                    )}
                  </div>
                  {kit.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.logoUrl} alt="Logo preview" className="cc-logo-preview" />
                  )}
                </>
              )}
              <label>
                Watermark text
                <input
                  value={kit.watermark || ""}
                  onChange={(e) => setKit({ ...kit, watermark: e.target.value })}
                  placeholder="@channel · Clippers"
                />
              </label>
              <button type="button" className="btn primary" onClick={() => onBrandKit?.(kit)}>
                Save brand kit
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onBrandKit?.(kit);
                  onApplyBrandKit?.(kit);
                }}
              >
                Apply to timeline
              </button>
              {brandKit && onApplyBrandKit && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onApplyBrandKit(brandKit)}
                >
                  Apply brand from pack
                </button>
              )}
            </div>
          )}

          {tab === "analytics" && (
            <div className="cc-analytics-live">
              {loading && !score && <GrowthSkeleton rows={5} />}
              {score && (
                <div className="cc-analytics-score">
                  <h4>Predicted performance</h4>
                  <ViralScorecardView score={score} compact />
                  {typeof score.estimatedCtrPct === "number" && (
                    <div className="cc-score-row" style={{ marginTop: "0.65rem" }}>
                      <span>Est. CTR</span>
                      <div className="cc-score-track">
                        <i style={{ width: `${Math.min(100, score.estimatedCtrPct)}%` }} />
                      </div>
                      <em>{score.estimatedCtrPct}%</em>
                    </div>
                  )}
                  {(score.retentionCurve?.length ?? 0) > 1 && (
                    <div className="cc-ret-curve" aria-label="Predicted retention curve">
                      <strong>Retention curve</strong>
                      <svg viewBox="0 0 220 64" width="100%" height="64" role="img">
                        <polyline
                          fill="none"
                          stroke="#12d6a0"
                          strokeWidth="2.5"
                          points={(score.retentionCurve || [])
                            .map((p) => `${p.t * 210 + 5},${60 - (p.pct / 100) * 52}`)
                            .join(" ")}
                        />
                      </svg>
                    </div>
                  )}
                  {score.bestPlatforms.length > 0 && (
                    <div className="cc-platform-bars">
                      <strong>Platform fit (score)</strong>
                      {score.bestPlatforms.map((p, i) => {
                        const pct = Math.max(20, 100 - i * 18);
                        const platViews = analytics?.byPlatform?.[p]?.views ?? 0;
                        return (
                          <div key={p} className="cc-score-row">
                            <span>{p}</span>
                            <div className="cc-score-track">
                              <i style={{ width: `${pct}%` }} />
                            </div>
                            <em>{platViews > 0 ? `${platViews} views` : `${pct}%`}</em>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!score && !loading && (
                <GrowthEmpty
                  title="No predictions yet"
                  hint="Run analyze to see predicted retention and platform fit."
                  cta={onRunAnalyze ? "Run Analyze" : undefined}
                  onCta={onRunAnalyze ? () => void handleRunAnalyze() : undefined}
                  busy={analyzing}
                />
              )}

              <h4>Exports</h4>
              {!exportJobs.length && (
                <p className="cc-lib-hint">No exports yet — render from Deliver to fill the queue.</p>
              )}
              <ul className="cc-ai-list">
                {exportJobs.slice(0, 8).map((j) => (
                  <li key={j.id}>
                    <div className="cc-ai-item" style={{ cursor: "default" }}>
                      <span className="cc-ai-emoji">
                        {j.status === "done" ? "✓" : j.status === "error" ? "✕" : "…"}
                      </span>
                      <span className="cc-ai-meta">
                        <strong>
                          {j.format || "export"} · {j.status}
                        </strong>
                        <span>
                          {j.error ||
                            (j.createdAt
                              ? new Date(j.createdAt).toLocaleString()
                              : j.id.slice(0, 8))}
                        </span>
                      </span>
                      {j.status === "done" && (j.downloadUrl || j.previewUrl) && (
                        <span className="cc-platform-row">
                          {j.previewUrl && (
                            <a
                              className="cc-hook-chip"
                              href={j.previewUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Preview
                            </a>
                          )}
                          {j.downloadUrl && (
                            <a
                              className="cc-hook-chip on"
                              href={j.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="cc-analytics-shell" style={{ marginTop: "0.85rem" }}>
                <div className="cc-stat">
                  <strong>{analytics?.views ?? 0}</strong>
                  <span>Views</span>
                </div>
                <div className="cc-stat">
                  <strong>{analytics?.likes ?? 0}</strong>
                  <span>Likes</span>
                </div>
                <div className="cc-stat">
                  <strong>{analytics?.comments ?? 0}</strong>
                  <span>Comments</span>
                </div>
                <div className="cc-stat">
                  <strong>{exportHistoryCount}</strong>
                  <span>Exports done</span>
                </div>
                {typeof analytics?.avgRetentionPct === "number" && (
                  <div className="cc-stat">
                    <strong>{analytics.avgRetentionPct}%</strong>
                    <span>Est. retention</span>
                  </div>
                )}
              </div>
              {!analytics?.views && !(analytics?.recent || []).length ? (
                <p className="cc-lib-hint">
                  No metrics yet — publish to YouTube or pull live stats.
                </p>
              ) : (
                <p className="cc-lib-hint">Live metrics from publish + YouTube pull.</p>
              )}
              <button
                type="button"
                className="btn primary"
                aria-label="Pull YouTube analytics stats"
                onClick={async () => {
                  const res = await fetch("/api/analytics/youtube/pull", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ projectId }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setAnalytics(data.summary);
                    setAnalyticsMsg(`Pulled ${data.pulled} YouTube videos`);
                  } else {
                    setAnalyticsMsg(data.error || "YouTube pull failed");
                  }
                }}
              >
                Pull YouTube stats
              </button>
              {analyticsMsg && <p className="cc-copied">{analyticsMsg}</p>}
              {analytics?.byPlatform && Object.keys(analytics.byPlatform).length > 0 && (
                <div className="cc-platform-bars" style={{ marginTop: "0.75rem" }}>
                  <strong>Live by platform</strong>
                  {Object.entries(analytics.byPlatform).map(([plat, stats]) => {
                    const max = Math.max(
                      ...Object.values(analytics.byPlatform).map((s) => s.views),
                      1,
                    );
                    const pct = Math.round((stats.views / max) * 100);
                    return (
                      <div key={plat} className="cc-score-row">
                        <span>{plat}</span>
                        <div className="cc-score-track">
                          <i style={{ width: `${pct}%` }} />
                        </div>
                        <em>{stats.views} views</em>
                      </div>
                    );
                  })}
                </div>
              )}
              <ul className="cc-ai-list" style={{ marginTop: "0.75rem" }}>
                {(analytics?.recent || []).slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <div className="cc-ai-item" style={{ cursor: "default" }}>
                      <span className="cc-ai-emoji">▣</span>
                      <span className="cc-ai-meta">
                        <strong>
                          {e.platform} · {e.views} views
                        </strong>
                        <span>
                          {e.likes} likes · {new Date(e.recordedAt).toLocaleString()}
                          {typeof e.retentionPct === "number"
                            ? ` · ~${e.retentionPct}% retention`
                            : ""}
                        </span>
                        {typeof e.retentionPct === "number" && (
                          <span
                            className="cc-ret-bar"
                            aria-hidden
                            style={{
                              display: "block",
                              marginTop: "0.35rem",
                              height: 4,
                              borderRadius: 2,
                              background: "rgba(18,214,160,0.15)",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                height: "100%",
                                width: `${Math.min(100, e.retentionPct)}%`,
                                background: "#12d6a0",
                              }}
                            />
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "cloud" && (
            <div className="cc-cloud-shell">
              <p className="cc-lib-hint">
                Local team roles gate sync and approvals. Push / pull snapshots under .data/cloud.
              </p>
              <div className="cc-team-row">
                <label>
                  Your name
                  <input
                    value={teamName}
                    onChange={(e) => {
                      setTeamName(e.target.value);
                      saveTeamName(e.target.value);
                    }}
                  />
                </label>
                <div className="cc-platform-row">
                  {TEAM_ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      title={r.hint}
                      className={teamRole === r.id ? "cc-hook-chip on" : "cc-hook-chip"}
                      onClick={() => {
                        setTeamRole(r.id);
                        saveTeamRole(r.id);
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cc-ai-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canCloudSync(teamRole)}
                  onClick={() => void cloudAction("push")}
                >
                  Push to cloud
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canCloudSync(teamRole)}
                  onClick={() => void cloudAction("pull")}
                >
                  Pull from cloud
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canRequestApproval(teamRole)}
                  onClick={() => void cloudAction("request")}
                >
                  Request approval
                </button>
                {onCreateShareLink && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void onCreateShareLink()}
                  >
                    Copy share link
                  </button>
                )}
              </div>
              {cloudMsg && <p className="cc-copied">{cloudMsg}</p>}
              <h4 style={{ marginTop: "1rem" }}>Cloud versions</h4>
              <p className="cc-lib-hint">
                Each push archives a revision — restore to reload that snapshot into the editor.
              </p>
              <ul className="cc-ai-list">
                {cloudVersions.map((v) => (
                  <li key={v.revision}>
                    <div className="cc-ai-item cc-cleanup-row">
                      <span className="cc-ai-meta">
                        <strong>
                          Rev {v.revision}
                          {v.name ? ` · ${v.name.slice(0, 24)}` : ""}
                        </strong>
                        <span>
                          {v.syncedAt
                            ? new Date(v.syncedAt).toLocaleString()
                            : "Unknown time"}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="cc-hook-chip on"
                        disabled={!canCloudSync(teamRole)}
                        onClick={() =>
                          void cloudAction("restore", { revision: v.revision })
                        }
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
                {!cloudVersions.length && !versionsBusy && (
                  <li className="cc-lib-hint">No cloud versions yet — push to create one.</li>
                )}
                {versionsBusy && <li className="cc-lib-hint">Loading versions…</li>}
              </ul>
              <button
                type="button"
                className="btn"
                disabled={versionsBusy}
                onClick={() => void refreshCloudVersions()}
              >
                Refresh versions
              </button>
              <h4 style={{ marginTop: "1rem" }}>Inbox</h4>
              <ul className="cc-ai-list">
                {notifs.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <div className="cc-ai-item" style={{ cursor: "default", opacity: n.read ? 0.65 : 1 }}>
                      <span className="cc-ai-emoji">{n.read ? "○" : "●"}</span>
                      <span className="cc-ai-meta">
                        <strong>{n.title}</strong>
                        <span>{n.body}</span>
                      </span>
                    </div>
                  </li>
                ))}
                {!notifs.length && <li className="cc-lib-hint">No notifications yet.</li>}
              </ul>
              {notifs.some((n) => !n.read) && (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await fetch("/api/notifications", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "read" }),
                    });
                    void refreshNotifs();
                  }}
                >
                  Mark all read
                </button>
              )}
              <h4 style={{ marginTop: "1rem" }}>Review comments</h4>
              {!reviewComments.length && (
                <p className="cc-lib-hint">No share-link comments yet — open Review to collect feedback.</p>
              )}
              <ul className="cc-ai-list">
                {reviewComments.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <div className="cc-ai-item" style={{ cursor: "default" }}>
                      <span className="cc-ai-emoji">💬</span>
                      <span className="cc-ai-meta">
                        <strong>
                          {c.author} · {c.t.toFixed(1)}s
                        </strong>
                        <span>{c.text}</span>
                        {canRequestApproval(teamRole) && (
                          <button
                            type="button"
                            className="cc-hook-chip"
                            style={{ marginTop: "0.35rem" }}
                            onClick={() =>
                              void cloudAction("request", {
                                commentId: c.id,
                                title: `Review @ ${c.t.toFixed(1)}s`,
                                note: c.text,
                              })
                            }
                          >
                            Request approval
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <h4 style={{ marginTop: "1rem" }}>Approvals</h4>
              <ul className="cc-ai-list">
                {approvals.map((a) => (
                  <li key={a.id}>
                    <div className="cc-ai-item" style={{ cursor: "default" }}>
                      <span className="cc-ai-emoji">
                        {a.status === "approved" ? "✓" : a.status === "rejected" ? "✕" : "…"}
                      </span>
                      <span className="cc-ai-meta">
                        <strong>
                          {a.title} · {a.status}
                        </strong>
                        <span>
                          {a.author}
                          {a.authorRole ? ` (${a.authorRole})` : ""} — {a.note || "No note"}
                        </span>
                        {a.status === "pending" && canResolveApproval(teamRole) && (
                          <span className="cc-platform-row" style={{ marginTop: "0.35rem" }}>
                            <button
                              type="button"
                              className="cc-hook-chip on"
                              onClick={() => void resolveAppr(a.id, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="cc-hook-chip"
                              onClick={() => void resolveAppr(a.id, "reject")}
                            >
                              Reject
                            </button>
                          </span>
                        )}
                        {a.status === "pending" && !canResolveApproval(teamRole) && (
                          <span className="cc-lib-hint">Switch to Reviewer/Admin to resolve</span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
                {!approvals.length && <li className="cc-lib-hint">No approval requests yet.</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
