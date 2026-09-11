"use client";

import type { AspectRatio, Job, RenderedClip } from "@/lib/types";
import { previewAspect } from "@/lib/clip-studio-utils";

type Props = {
  job: Job;
  aspectRatio: AspectRatio;
  captionsEnabled: boolean;
  onEdit: (clip: RenderedClip) => void;
  onError: (message: string) => void;
};

export function ClipResults({
  job,
  aspectRatio,
  captionsEnabled,
  onEdit,
  onError,
}: Props) {
  if (job.clips.length === 0 || job.status === "error") return null;

  return (
    <section className="clips" aria-live="polite">
      <h2>{job.status === "done" ? "Ready to share" : "Clips so far"}</h2>
      <p className="clips-sub">
        Your best moments, cut and scored — pick one, download, or jump into Studio to polish
        before you post.
        {aspectRatio ? ` · ${aspectRatio}` : ""}
        {captionsEnabled ? " · captions burned in" : " · clean export"}
      </p>

      {(job.analyticsSummary || (job.chapters && job.chapters.length > 0)) && (
        <div className="analytics-panel">
          {job.analyticsSummary && (
            <p className="clips-sub">
              SEO {job.analyticsSummary.seoScore} · Edit {job.analyticsSummary.editingQuality}
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
            <div className="clip-phone" style={{ aspectRatio: previewAspect(aspectRatio) }}>
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
                <button type="button" className="clip-edit-btn" onClick={() => onEdit(clip)}>
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
                      onError(
                        err instanceof Error ? err.message : "Could not open in Studio",
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
  );
}
