"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ClipEditor } from "@/components/ClipEditor";
import type { Job, RenderedClip } from "@/lib/types";
import {
  appendJobParams,
  friendlyJobError,
  type JobHistoryItem,
} from "@/lib/clip-studio-utils";
import { fetchJobHistory, useJobPolling } from "@/hooks/useJobPolling";
import { useClipStudioControls } from "@/hooks/useClipStudioControls";
import { ClipStudioControls } from "./ClipStudioControls";
import { ClipResults } from "./ClipResults";
import { JobHistory } from "./JobHistory";
import { JobProgress } from "./JobProgress";
import { UrlUploadForm } from "./UrlUploadForm";

export function ClipStudio() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RenderedClip | null>(null);
  const [history, setHistory] = useState<JobHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  const controls = useClipStudioControls();

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await fetchJobHistory());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useJobPolling({ job, setJob, setError, refreshHistory });

  async function controlJob(action: "pause" | "resume" | "cancel") {
    if (!job) return;
    setError(null);
    setJob((prev) =>
      prev
        ? {
            ...prev,
            status:
              action === "pause"
                ? "paused"
                : action === "cancel"
                  ? "cancelled"
                  : prev.status,
            message:
              action === "pause"
                ? "Paused — resume anytime"
                : action === "cancel"
                  ? "Cancelling…"
                  : "Resuming…",
          }
        : prev,
    );
    try {
      const res = await fetch(`/api/jobs/${job.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(friendlyJobError(data.error) || "Control failed");
        const sync = await fetch(`/api/jobs/${job.id}`);
        const syncData = await sync.json();
        if (syncData.job) setJob(syncData.job as Job);
        return;
      }
      if (data.job) setJob(data.job as Job);
      void refreshHistory();
    } catch {
      setError("Could not update job — check the server is running");
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
    const trimmed = url.trim();
    if (!file && trimmed) {
      try {
        const u = new URL(trimmed);
        if (!/^https?:$/i.test(u.protocol)) {
          setError("Use an https:// link to YouTube, TikTok, or Instagram.");
          return;
        }
      } catch {
        setError("That doesn’t look like a valid URL. Paste the full video link.");
        return;
      }
    }
    startTransition(async () => {
      try {
        let res: Response;
        const params = controls.value();
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
          setError(friendlyJobError(data.error) || "Could not start clipping");
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
  const activeAspect = job?.aspectRatio || controls.aspectRatio;
  const activeCaptions = job?.captionsEnabled ?? controls.captionsEnabled;
  const showProgress =
    job != null &&
    job.status !== "done" &&
    job.status !== "error" &&
    job.status !== "cancelled";

  return (
    <div className="studio studio-clean">
      <UrlUploadForm
        url={url}
        file={file}
        busy={busy}
        canSubmit={canSubmit}
        onUrlChange={setUrl}
        onFileChange={setFile}
        onSubmit={onSubmit}
      />

      <div className="studio-opts">
        <ClipStudioControls busy={busy} value={controls.value()} onChange={controls.onChange} />
      </div>

      {error && (
        <div className="form-error-banner" role="alert">
          <p className="form-error">{error}</p>
          {(error.toLowerCase().includes("cookie") ||
            error.toLowerCase().includes("instagram")) && (
            <p className="form-error-hint">
              Tip: export cookies for instagram.com into <code>tools/cookies.txt</code>, then retry
              Social Clean.
            </p>
          )}
        </div>
      )}

      {job && showProgress && (
        <JobProgress job={job} busy={busy} canControl={canControl} onControl={controlJob} />
      )}

      {job?.status === "error" && job.error && (
        <div className="form-error-banner" role="alert">
          <p className="form-error">{friendlyJobError(job.error)}</p>
        </div>
      )}

      <JobHistory
        history={history}
        activeJobId={job?.id}
        open={showHistory}
        onToggle={() => setShowHistory((v) => !v)}
        onOpen={openHistoryJob}
      />

      {job && (
        <ClipResults
          job={job}
          aspectRatio={activeAspect}
          captionsEnabled={activeCaptions}
          onEdit={setEditing}
          onError={setError}
        />
      )}

      {editing && job && (
        <ClipEditor job={job} clip={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
