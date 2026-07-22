"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ExportCodec,
  ExportQuality,
  Job,
  LayoutMode,
  RenderedClip,
  WhisperQuality,
} from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import { CAPTION_THEMES } from "@/lib/caption-polish";
import { ClipEditor } from "./ClipEditor";

const STEPS = [
  { key: "downloading", label: "Pull" },
  { key: "transcribing", label: "Whisper" },
  { key: "analyzing", label: "Moments" },
  { key: "rendering", label: "Export" },
] as const;

const CAPTION_THEME_LIST = Object.values(CAPTION_THEMES);

type HistoryItem = {
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

function statusIndex(status: Job["status"]) {
  const order = ["queued", "downloading", "transcribing", "analyzing", "rendering", "done"];
  return Math.max(0, order.indexOf(status));
}

function previewAspect(ratio: AspectRatio) {
  const { w, h } = ASPECT_PRESETS[ratio];
  return `${w} / ${h}`;
}

function formatMsShort(ms: number) {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.max(1, Math.round(sec / 60));
  return `${min}m`;
}

type JobParams = {
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  captionsEnabled: boolean;
  whisperQuality: WhisperQuality;
  captionTheme: CaptionThemeId;
  captionReadMode: CaptionReadMode;
  captionEmojis: boolean;
  exportQuality: ExportQuality;
  exportCodec: ExportCodec;
  preferHwEncode: boolean;
};

function appendJobParams(form: FormData, params: JobParams) {
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
}

export function ClipStudio() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [whisperQuality, setWhisperQuality] = useState<WhisperQuality>("fast");
  const [captionTheme, setCaptionTheme] = useState<CaptionThemeId>("tiktok-bold");
  const [captionReadMode, setCaptionReadMode] = useState<CaptionReadMode>("readable");
  const [captionEmojis, setCaptionEmojis] = useState(true);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("very-high");
  const [exportCodec, setExportCodec] = useState<ExportCodec>("h264");
  const [preferHwEncode, setPreferHwEncode] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RenderedClip | null>(null);

  async function refreshHistory() {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.jobs) setHistory(data.jobs as HistoryItem[]);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    if (
      !job ||
      job.status === "done" ||
      job.status === "error" ||
      job.status === "cancelled"
    ) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        const data = await res.json();
        if (data.job) {
          const next = data.job as Job;
          setJob(next);
          if (
            next.status === "done" ||
            next.status === "error" ||
            next.status === "cancelled"
          ) {
            void refreshHistory();
          }
        }
      } catch {
        // ignore
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job]);

  function jobParams(): JobParams {
    return {
      aspectRatio,
      layoutMode,
      captionsEnabled,
      whisperQuality,
      captionTheme,
      captionReadMode,
      captionEmojis,
      exportQuality,
      exportCodec,
      preferHwEncode,
    };
  }

  async function controlJob(action: "pause" | "resume" | "cancel") {
    if (!job) return;
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Control failed");
        return;
      }
      if (data.job) setJob(data.job as Job);
      void refreshHistory();
    } catch {
      setError("Could not update job");
    }
  }

  async function openHistoryJob(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (!res.ok || !data.job) {
        setError(data.error || "Job not found");
        return;
      }
      setJob(data.job as Job);
    } catch {
      setError("Could not load job");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let res: Response;
        const params = jobParams();
        if (file) {
          const form = new FormData();
          form.append("file", file);
          form.append("title", file.name.replace(/\.[^.]+$/, ""));
          appendJobParams(form, params);
          res = await fetch("/api/jobs/upload", { method: "POST", body: form });
        } else {
          res = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              downloadHint: "auto",
              ...params,
            }),
          });
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not start clipping");
          return;
        }
        setJob(data.job as Job);
        void refreshHistory();
      } catch {
        setError("Network error — is the dev server running?");
      }
    });
  }

  const busy =
    pending ||
    (job != null &&
      job.status !== "done" &&
      job.status !== "error" &&
      job.status !== "cancelled" &&
      job.status !== "paused");

  const canControl =
    job != null &&
    job.status !== "done" &&
    job.status !== "error" &&
    job.status !== "cancelled";

  const canSubmit = Boolean(file) || Boolean(url.trim());
  const activeAspect = job?.aspectRatio || aspectRatio;
  const activeCaptions = job?.captionsEnabled ?? captionsEnabled;
  const showProgress =
    job != null &&
    job.status !== "done" &&
    job.status !== "error" &&
    job.status !== "cancelled";

  return (
    <div className="studio studio-clean">
      <form className="url-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="video-url">
          Video link
        </label>
        <input
          id="video-url"
          type="url"
          placeholder="Paste a video link…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value.trim()) setFile(null);
          }}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !canSubmit}>
          {busy ? "Working…" : "Make clips"}
        </button>
      </form>

      <div className="studio-actions">
        <label className={busy ? "upload-btn disabled" : "upload-btn"}>
          {file ? file.name : "Or upload MP4"}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
            disabled={busy}
            hidden
            onChange={(e) => {
              const next = e.target.files?.[0] || null;
              setFile(next);
              if (next) setUrl("");
            }}
          />
        </label>
        {file && (
          <button
            type="button"
            className="upload-clear"
            disabled={busy}
            onClick={() => setFile(null)}
          >
            Clear
          </button>
        )}
      </div>

      <div className="studio-opts">
        <label className="opt-row">
          <span>Scale</span>
          <select
            value={aspectRatio}
            disabled={busy}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          >
            {(Object.keys(ASPECT_PRESETS) as AspectRatio[]).map((key) => (
              <option key={key} value={key}>
                {ASPECT_PRESETS[key].label} — {ASPECT_PRESETS[key].hint}
              </option>
            ))}
          </select>
        </label>

        <label className="opt-row">
          <span>Layout</span>
          <select
            value={layoutMode}
            disabled={busy}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
          >
            <option value="auto">Auto</option>
            <option value="face-top">Face on top</option>
            <option value="fill">Fill only</option>
          </select>
        </label>

        <label className="opt-row">
          <span>Captions</span>
          <select
            value={captionsEnabled ? "on" : "off"}
            disabled={busy}
            onChange={(e) => setCaptionsEnabled(e.target.value === "on")}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>

        {captionsEnabled && (
          <label className="opt-row">
            <span>Style</span>
            <select
              value={captionTheme}
              disabled={busy}
              onChange={(e) => setCaptionTheme(e.target.value as CaptionThemeId)}
            >
              {CAPTION_THEME_LIST.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="more-toggle"
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? "Hide options" : "More options"}
        </button>

        <div className={showMore ? "studio-opts-more open" : "studio-opts-more"}>
          <div className="studio-opts-more-inner">
            {captionsEnabled && (
              <>
                <label className="opt-row">
                  <span>Read mode</span>
                  <select
                    value={captionReadMode}
                    disabled={busy}
                    onChange={(e) =>
                      setCaptionReadMode(e.target.value as CaptionReadMode)
                    }
                  >
                    <option value="readable">Readable</option>
                    <option value="verbatim">Verbatim</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </label>
                <label className="opt-row">
                  <span>Emojis</span>
                  <select
                    value={captionEmojis ? "on" : "off"}
                    disabled={busy}
                    onChange={(e) => setCaptionEmojis(e.target.value === "on")}
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              </>
            )}
            <label className="opt-row">
              <span>Whisper</span>
              <select
                value={whisperQuality}
                disabled={busy}
                onChange={(e) =>
                  setWhisperQuality(e.target.value as WhisperQuality)
                }
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="best">Best</option>
              </select>
            </label>
            <label className="opt-row">
              <span>Quality</span>
              <select
                value={exportQuality}
                disabled={busy}
                onChange={(e) =>
                  setExportQuality(e.target.value as ExportQuality)
                }
              >
                <option value="high">High</option>
                <option value="very-high">Very high</option>
                <option value="maximum">Maximum</option>
              </select>
            </label>
            <label className="opt-row">
              <span>Codec</span>
              <select
                value={exportCodec}
                disabled={busy}
                onChange={(e) => setExportCodec(e.target.value as ExportCodec)}
              >
                <option value="h264">H.264</option>
                <option value="hevc">H.265</option>
                <option value="av1">AV1</option>
                <option value="vp9">VP9</option>
              </select>
            </label>
            <label className="opt-row">
              <span>Encode</span>
              <select
                value={preferHwEncode ? "hw" : "soft"}
                disabled={busy}
                onChange={(e) => setPreferHwEncode(e.target.value === "hw")}
              >
                <option value="hw">Hardware auto</option>
                <option value="soft">Software</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {/* 1) Loading / progress */}
      {job && showProgress && (
        <section className="job-panel job-progress" aria-live="polite">
          <p className="job-status">{job.message}</p>
          {job.title && <p className="job-title">{job.title}</p>}
          <p className="job-title">
            {job.progress}%
            {job.etaMs != null && job.etaMs > 0
              ? ` · ~${formatMsShort(job.etaMs)} left`
              : ""}
            {job.elapsedMs != null && job.elapsedMs > 0
              ? ` · ${formatMsShort(job.elapsedMs)} elapsed`
              : ""}
          </p>

          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>

          <ol className="steps">
            {STEPS.map((step, i) => {
              const idx = statusIndex(job.status);
              const active =
                job.status === step.key ||
                (job.status === "queued" && i === 0) ||
                job.status === "done";
              const done =
                job.status === "done" ||
                idx > i + 1 ||
                (job.status === step.key && job.progress > 10);
              return (
                <li
                  key={step.key}
                  className={
                    job.status === "error"
                      ? "step"
                      : done || active
                        ? "step on"
                        : "step"
                  }
                >
                  <span className="step-dot" />
                  {step.label}
                </li>
              );
            })}
          </ol>

          {canControl && (
            <div className="job-controls">
              {job.status === "paused" ? (
                <button type="button" className="chip on" onClick={() => controlJob("resume")}>
                  Resume
                </button>
              ) : (
                <button type="button" className="chip" onClick={() => controlJob("pause")}>
                  Pause
                </button>
              )}
              <button type="button" className="chip" onClick={() => controlJob("cancel")}>
                Cancel
              </button>
            </div>
          )}
        </section>
      )}

      {job?.status === "error" && job.error && (
        <p className="form-error">{job.error}</p>
      )}

      {/* 2) Recent jobs */}
      {history.length > 0 && (
        <div className="history-block">
          <button
            type="button"
            className={showHistory ? "history-toggle open" : "history-toggle"}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <span>Recent jobs</span>
            <span className="history-arrow" aria-hidden>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path
                  d="M3.5 6.25 8 10.75l4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <div className={showHistory ? "history-panel open" : "history-panel"}>
            <div className="history-panel-inner">
              <ul className="job-history">
                {history.slice(0, 6).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className={job?.id === h.id ? "history-item on" : "history-item"}
                      onClick={() => openHistoryJob(h.id)}
                    >
                      <span className="history-status">{h.status}</span>
                      <span className="history-title">
                        {h.title || h.url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </span>
                      <span className="history-meta">
                        {h.clipCount ? `${h.clipCount} clips` : `${h.progress}%`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 3) Ready to share */}
      {job?.status === "done" && job.clips.length > 0 && (
        <section className="clips" aria-live="polite">
          <h2>Ready to share</h2>
          <p className="clips-sub">
            Your best moments, cut and scored — pick one, download, or jump into
            Studio to polish before you post.
            {activeAspect ? ` · ${activeAspect}` : ""}
            {activeCaptions ? " · captions burned in" : " · clean export"}
          </p>

          {(job.analyticsSummary || (job.chapters && job.chapters.length > 0)) && (
            <div className="analytics-panel">
              {job.analyticsSummary && (
                <p className="clips-sub">
                  SEO {job.analyticsSummary.seoScore} · Edit{" "}
                  {job.analyticsSummary.editingQuality}
                  {job.analyticsSummary.platformFit
                    ? ` · TT ${job.analyticsSummary.platformFit.tiktok} · Reels ${job.analyticsSummary.platformFit.reels} · Shorts ${job.analyticsSummary.platformFit.shorts}`
                    : ""}
                </p>
              )}
              {job.chapters && job.chapters.length > 0 && (
                <div className="chapters-block">
                  <ul className="chapters-list">
                    {job.chapters.map((ch) => (
                      <li key={ch}>{ch}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      void navigator.clipboard.writeText(job.chapters!.join("\n"));
                    }}
                  >
                    Copy chapters
                  </button>
                </div>
              )}
            </div>
          )}

          <ul className="clip-grid">
            {job.clips.map((clip) => (
              <li key={clip.id} className="clip-item">
                <div
                  className="clip-phone"
                  style={{ aspectRatio: previewAspect(activeAspect) }}
                >
                  <video
                    src={clip.previewUrl}
                    controls
                    playsInline
                    preload="metadata"
                    poster={clip.thumbnailUrl}
                  />
                </div>
                <div className="clip-info">
                  <div className="clip-score">{clip.viralityScore}</div>
                  <h3>{clip.title}</h3>
                  <p>{clip.hook}</p>
                  {clip.hashtags && clip.hashtags.length > 0 && (
                    <p className="clip-reason">{clip.hashtags.join(" ")}</p>
                  )}
                  <p className="clip-reason">{clip.reason}</p>
                  <div className="clip-actions">
                    <button
                      type="button"
                      className="clip-edit-btn"
                      onClick={() => setEditing(clip)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="clip-edit-btn"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/editor/project/from-clip", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              jobId: job.id,
                              clipId: clip.id,
                              name: clip.title,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Handoff failed");
                          const pid = data.project?.id as string;
                          if (!pid) throw new Error("No project id");
                          sessionStorage.setItem("clippers.openProject", pid);
                          window.location.href = `/?studio=${encodeURIComponent(pid)}#studio`;
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Could not open in Studio",
                          );
                        }
                      }}
                    >
                      Studio
                    </button>
                    <a href={clip.downloadUrl} download>
                      Download
                    </a>
                    <span>{Math.round(clip.duration)}s</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && job && (
        <ClipEditor job={job} clip={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
