"use client";

import { startTransition, useEffect, type Dispatch, type SetStateAction } from "react";
import type { Job } from "@/lib/types";
import type { JobHistoryItem } from "@/lib/clip-studio-utils";
import { friendlyJobError } from "@/lib/clip-studio-utils";

type Args = {
  job: Job | null;
  setJob: Dispatch<SetStateAction<Job | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshHistory: () => void | Promise<void>;
};

function pollIntervalMs(status: Job["status"] | undefined) {
  if (status === "rendering") return 900;
  if (status === "downloading" || status === "queued") return 2000;
  if (status === "transcribing" || status === "analyzing") return 1600;
  return 1500;
}

/**
 * Light adaptive polling — no stacked fetches, state updates via startTransition.
 */
export function useJobPolling({ job, setJob, setError, refreshHistory }: Args) {
  useEffect(() => {
    if (
      !job ||
      job.status === "done" ||
      job.status === "error" ||
      job.status === "cancelled"
    ) {
      return;
    }
    const jobId = job.id;
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let status: Job["status"] = job.status;

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void poll();
      }, pollIntervalMs(status));
    };

    const poll = async () => {
      if (cancelled || inFlight) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });
        let data = await res.json();
        if (!res.ok || !data.job) {
          const fallback = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
            cache: "no-store",
          });
          data = await fallback.json();
        }
        if (cancelled || !data.job) return;
        const next = data.job as Job;
        status = next.status;
        startTransition(() => {
          setJob((prev) => (prev && prev.id === next.id ? next : prev));
        });
        if (next.status === "error" && next.error) {
          setError(friendlyJobError(next.error));
        }
        if (
          next.status === "done" ||
          next.status === "error" ||
          next.status === "cancelled"
        ) {
          void refreshHistory();
          return;
        }
      } catch {
        // Keep polling through transient blips.
      } finally {
        inFlight = false;
        if (
          !cancelled &&
          status !== "done" &&
          status !== "error" &&
          status !== "cancelled"
        ) {
          schedule();
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll on id/status only
  }, [job?.id, job?.status]);
}

export async function fetchJobHistory(): Promise<JobHistoryItem[]> {
  const res = await fetch("/api/jobs", { cache: "no-store" });
  const data = await res.json();
  return (data.jobs as JobHistoryItem[]) || [];
}
