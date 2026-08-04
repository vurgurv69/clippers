"use client";

import type { ReactNode } from "react";
import type { ExportFormat } from "@/lib/editor-types";
import { RailIcon } from "@/components/editor/RailIcons";

/** Right-rail inspector — properties for the current selection. */
export type InspectorTab =
  | "clip"
  | "transform"
  | "color"
  | "audio"
  | "effects"
  | "animation"
  | "fx"
  | "text"
  | "transitions"
  | "extra";

export type ExportQueueItem = {
  id: string;
  status: string;
  format?: string;
  error?: string;
  downloadUrl?: string;
  previewUrl?: string;
  createdAt?: number;
  updatedAt?: number;
};

const TABS: { id: InspectorTab; label: string; icon: string }[] = [
  { id: "clip", label: "Clip", icon: "clip" },
  { id: "transform", label: "Move", icon: "move" },
  { id: "color", label: "Color", icon: "color" },
  { id: "audio", label: "Audio", icon: "audio" },
  { id: "text", label: "Text", icon: "text" },
  { id: "extra", label: "Extra", icon: "extra" },
];

function relTime(ts?: number) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function statusLabel(status: string) {
  if (status === "running") return "Rendering…";
  if (status === "queued") return "Queued";
  if (status === "done") return "Done";
  if (status === "error") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export function StudioInspector({
  tab,
  onTab,
  children,
  error,
  resultDownloadUrl,
  exportFormat,
  exportJobs,
  onRefreshJobs,
  onCancelJob,
  onClearFinishedJobs,
  inspSearch = "",
  onInspSearch,
  collapsed,
  onToggleCollapsed,
}: {
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  children: ReactNode;
  error?: string | null;
  resultDownloadUrl?: string | null;
  exportFormat: ExportFormat | string;
  exportJobs: ExportQueueItem[];
  onRefreshJobs: () => void | Promise<void>;
  onCancelJob: (jobId: string) => void | Promise<void>;
  onClearFinishedJobs?: () => void;
  inspSearch?: string;
  onInspSearch?: (q: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const active = exportJobs.filter((j) => j.status === "queued" || j.status === "running");
  const finished = exportJobs.filter(
    (j) => j.status === "done" || j.status === "error" || j.status === "cancelled",
  );
  // Effects / Trans / Anim live on the left — highlight Clip if a stale tab leaks in.
  const railIds = new Set(TABS.map((t) => t.id));
  const railTab: InspectorTab = railIds.has(tab) ? tab : "clip";

  const rail = (
    <nav className="cc-rail cc-rail-right" role="tablist" aria-orientation="vertical" aria-label="Inspector panels">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`insp-tab-${t.id}`}
          aria-controls={`insp-panel-${t.id}`}
          aria-selected={railTab === t.id}
          tabIndex={railTab === t.id ? 0 : -1}
          className={railTab === t.id ? "cc-rail-btn on" : "cc-rail-btn"}
          onClick={() => {
            onTab(t.id);
            onInspSearch?.("");
            if (collapsed) onToggleCollapsed?.();
          }}
          title={t.label}
        >
          <span className="cc-rail-ico" aria-hidden>
            <RailIcon name={t.icon} />
          </span>
          <span className="cc-rail-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );

  if (collapsed) {
    return (
      <aside className="studio-inspector collapsed insp-rail-layout" aria-label="Inspector (collapsed)">
        {rail}
        {onToggleCollapsed && (
          <button
            type="button"
            className="insp-rail-btn insp-rail-expand"
            onClick={onToggleCollapsed}
            title="Show inspector"
            aria-label="Show inspector"
          >
            ‹
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="studio-inspector pro-inspector insp-rail-layout" aria-label="Inspector">
      {onToggleCollapsed && (
        <button
          type="button"
          className="insp-rail-btn"
          onClick={onToggleCollapsed}
          title="Hide inspector"
          aria-label="Hide inspector"
        >
          ›
        </button>
      )}
      <div className="inspector-main">
        {onInspSearch && (
          <input
            className="fx-search insp-search"
            placeholder="Search properties…"
            value={inspSearch}
            onChange={(e) => onInspSearch(e.target.value)}
            aria-label="Search inspector properties"
          />
        )}

        <div
          className="editor-panel-body insp-controls"
          role="tabpanel"
          id={`insp-panel-${tab}`}
          aria-labelledby={`insp-tab-${tab}`}
        >
          {children}
        </div>

        {error && <p className="form-error">{error}</p>}
        {resultDownloadUrl && (
          <div className="export-result">
            <p>Export ready</p>
            <a className="btn primary tiny" href={resultDownloadUrl} download>
              Download {String(exportFormat).toUpperCase()}
            </a>
          </div>
        )}
        {exportJobs.length > 0 && (
          <div className="export-queue">
            <div className="export-queue-head">
              <p className="tool-label">Queue</p>
              <div className="chip-row">
                <button className="btn tiny ghost" onClick={() => void onRefreshJobs()}>
                  Refresh
                </button>
                {onClearFinishedJobs && finished.length > 0 && (
                  <button className="btn tiny ghost" onClick={onClearFinishedJobs}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            {active.length > 0 && (
              <p className="tool-hint">
                {active.length} active · {finished.length} finished
              </p>
            )}
            {exportJobs.slice(0, 4).map((j) => (
              <div key={j.id} className={`queue-row ${j.status}`}>
                <div className="queue-meta">
                  <span className={`queue-status ${j.status}`}>{statusLabel(j.status)}</span>
                  <span className="queue-fmt">{(j.format || "mp4").toUpperCase()}</span>
                  {j.createdAt ? <span className="queue-time">{relTime(j.createdAt)}</span> : null}
                </div>
                <div className="queue-actions">
                  {j.status === "done" && j.downloadUrl && (
                    <a className="btn tiny primary" href={j.downloadUrl} download>
                      Download
                    </a>
                  )}
                  {j.status === "done" && j.previewUrl && (
                    <a className="btn tiny ghost" href={j.previewUrl} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  )}
                  {(j.status === "queued" || j.status === "running") && (
                    <button className="btn tiny danger" onClick={() => void onCancelJob(j.id)}>
                      Cancel
                    </button>
                  )}
                  {j.status === "error" && j.error && (
                    <span className="queue-err" title={j.error}>
                      {j.error}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {rail}
    </aside>
  );
}
