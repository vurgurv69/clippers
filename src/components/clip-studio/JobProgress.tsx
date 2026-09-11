"use client";

import type { Job } from "@/lib/types";
import { JOB_STEPS, formatMsShort, statusIndex } from "@/lib/clip-studio-utils";

type Props = {
  job: Job;
  busy: boolean;
  canControl: boolean;
  onControl: (action: "pause" | "resume" | "cancel") => void;
};

export function JobProgress({ job, busy, canControl, onControl }: Props) {
  return (
    <section className="job-panel job-progress" aria-live="polite" aria-busy={busy}>
      <p className="job-status">{job.message}</p>
      <p className="job-polling-hint">Live status · light adaptive refresh</p>
      {job.title && <p className="job-title">{job.title}</p>}
      <p className="job-title">
        {job.progress}%
        {job.etaMs != null && job.etaMs > 0 ? ` · ~${formatMsShort(job.etaMs)} left` : ""}
        {job.elapsedMs != null && job.elapsedMs > 0
          ? ` · ${formatMsShort(job.elapsedMs)} elapsed`
          : ""}
      </p>

      <div className="progress-track" aria-hidden>
        <div className="progress-fill" style={{ width: `${job.progress}%` }} />
      </div>

      <ol className="steps">
        {JOB_STEPS.map((step, i) => {
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
                job.status === "error" ? "step" : done || active ? "step on" : "step"
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
            <button type="button" className="chip on" onClick={() => onControl("resume")}>
              Resume
            </button>
          ) : (
            <button type="button" className="chip" onClick={() => onControl("pause")}>
              Pause
            </button>
          )}
          <button type="button" className="chip" onClick={() => onControl("cancel")}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
