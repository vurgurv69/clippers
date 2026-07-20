"use client";

import { useEffect, useState, useTransition } from "react";
import type { AspectRatio, Job, LayoutMode, RenderedClip } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import { ClipEditor } from "./ClipEditor";

const STEPS = [
  { key: "downloading", label: "Pull video" },
  { key: "transcribing", label: "Local Whisper" },
  { key: "analyzing", label: "Score viral cuts" },
  { key: "rendering", label: "Caption & export" },
] as const;

const LAYOUT_OPTIONS: { id: LayoutMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Face on top if gameplay + person" },
  { id: "face-top", label: "Face top", hint: "Always pin face over content" },
  { id: "fill", label: "Fill", hint: "No face bubble — full crop only" },
];

function statusIndex(status: Job["status"]) {
  const order = ["queued", "downloading", "transcribing", "analyzing", "rendering", "done"];
  return Math.max(0, order.indexOf(status));
}

function previewAspect(ratio: AspectRatio) {
  const { w, h } = ASPECT_PRESETS[ratio];
  return `${w} / ${h}`;
}

export function ClipStudio() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RenderedClip | null>(null);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        const data = await res.json();
        if (data.job) setJob(data.job as Job);
      } catch {
        // ignore transient poll errors
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let res: Response;
        if (file) {
          const form = new FormData();
          form.append("file", file);
          form.append("aspectRatio", aspectRatio);
          form.append("layoutMode", layoutMode);
          form.append("captionsEnabled", captionsEnabled ? "true" : "false");
          form.append("title", file.name.replace(/\.[^.]+$/, ""));
          res = await fetch("/api/jobs/upload", { method: "POST", body: form });
        } else {
          res = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              aspectRatio,
              layoutMode,
              captionsEnabled,
            }),
          });
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not start clipping");
          return;
        }
        setJob(data.job as Job);
      } catch {
        setError("Network error — is the dev server running?");
      }
    });
  }

  const busy =
    pending ||
    (job != null && job.status !== "done" && job.status !== "error");

  const canSubmit = Boolean(file) || Boolean(url.trim());
  const activeAspect = job?.aspectRatio || aspectRatio;
  const activeCaptions = job?.captionsEnabled ?? captionsEnabled;

  return (
    <div className="studio">
      <div className="option-block">
        <p className="option-label">Scale</p>
        <div className="chip-row" role="group" aria-label="Aspect ratio">
          {(Object.keys(ASPECT_PRESETS) as AspectRatio[]).map((key) => (
            <button
              key={key}
              type="button"
              className={aspectRatio === key ? "chip on" : "chip"}
              disabled={busy}
              onClick={() => setAspectRatio(key)}
              title={ASPECT_PRESETS[key].hint}
            >
              <span>{ASPECT_PRESETS[key].label}</span>
              <small>{ASPECT_PRESETS[key].hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="option-block">
        <p className="option-label">Layout</p>
        <div className="chip-row" role="group" aria-label="Layout mode">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={layoutMode === opt.id ? "chip on" : "chip"}
              disabled={busy}
              onClick={() => setLayoutMode(opt.id)}
              title={opt.hint}
            >
              <span>{opt.label}</span>
              <small>{opt.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="option-block">
        <p className="option-label">Captions</p>
        <div className="chip-row" role="group" aria-label="Captions">
          <button
            type="button"
            className={!captionsEnabled ? "chip on" : "chip"}
            disabled={busy}
            onClick={() => setCaptionsEnabled(false)}
            title="Export clean video with no Clippers text"
          >
            <span>Off</span>
            <small>Clean — no text burn</small>
          </button>
          <button
            type="button"
            className={captionsEnabled ? "chip on" : "chip"}
            disabled={busy}
            onClick={() => setCaptionsEnabled(true)}
            title="Burn colorful captions onto the clip"
          >
            <span>On</span>
            <small>Burn text on video</small>
          </button>
        </div>
      </div>

      <form className="url-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="video-url">
          Video link
        </label>
        <input
          id="video-url"
          type="url"
          placeholder="Paste a YouTube or TikTok link…"
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

      <div className="upload-row">
        <label className={busy ? "upload-btn disabled" : "upload-btn upload-btn-strong"}>
          {file ? file.name : "Upload MP4 (best for TikTok — no logo)"}
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
      <p className="upload-hint">
        Paste a TikTok link — Clippers pulls the HD version for you (no extra
        site). Upload is only a backup if your network blocks it.
      </p>

      {error && <p className="form-error">{error}</p>}

      {job && (
        <section className="job-panel" aria-live="polite">
          <div className="job-meta">
            <p className="job-status">{job.message}</p>
            {job.title && <p className="job-title">{job.title}</p>}
            <p className="job-title">
              {job.aspectRatio} · {job.layoutMode} ·{" "}
              <strong>
                captions {job.captionsEnabled ? "ON" : "OFF"}
              </strong>
            </p>
          </div>

          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>

          <ol className="steps">
            {STEPS.map((step, i) => {
              const idx = statusIndex(job.status);
              const active =
                job.status === step.key ||
                (job.status === "queued" && i === 0) ||
                (job.status === "done" && true);
              const done =
                job.status === "done" ||
                idx > i + 1 ||
                (job.status === step.key && job.progress > 10);
              const label =
                step.key === "rendering" && job.captionsEnabled === false
                  ? "Export"
                  : step.label;
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
                  {label}
                </li>
              );
            })}
          </ol>

          {job.status === "error" && job.error && (
            <p className="form-error">{job.error}</p>
          )}

          {job.status === "done" && job.clips.length > 0 && (
            <div className="clips">
              <h2>Ready to share</h2>
              <p className="clips-sub">
                {activeAspect} ·{" "}
                {activeCaptions
                  ? "with Clippers captions burned in"
                  : "no Clippers captions (clean video)"}
              </p>
              {!activeCaptions && (
                <p className="clips-sub">
                  Tip: TikTok / Instagram may still add their own auto-captions
                  when you post — turn those off in the app.
                </p>
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
                      />
                    </div>
                    <div className="clip-info">
                      <div className="clip-score">{clip.viralityScore}</div>
                      <h3>{clip.title}</h3>
                      <p>{clip.hook}</p>
                      <p className="clip-reason">
                        {clip.reason}
                        {clip.layoutUsed ? ` · layout ${clip.layoutUsed}` : ""}
                      </p>
                      <div className="clip-actions">
                        <button
                          type="button"
                          className="clip-edit-btn"
                          onClick={() => setEditing(clip)}
                        >
                          ✎ Edit
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
                          Open in Studio
                        </button>
                        <a href={clip.downloadUrl} download>
                          Download MP4
                        </a>
                        <span>{Math.round(clip.duration)}s</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {editing && job && (
        <ClipEditor job={job} clip={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
