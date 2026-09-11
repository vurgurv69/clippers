"use client";

import type { JobHistoryItem } from "@/lib/clip-studio-utils";

type Props = {
  history: JobHistoryItem[];
  activeJobId?: string;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
};

export function JobHistory({ history, activeJobId, open, onToggle, onOpen }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="history-block">
      <button
        type="button"
        className={open ? "history-toggle open" : "history-toggle"}
        aria-expanded={open}
        onClick={onToggle}
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
      <div className={open ? "history-panel open" : "history-panel"}>
        <div className="history-panel-inner">
          <ul className="job-history">
            {history.slice(0, 6).map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={activeJobId === h.id ? "history-item on" : "history-item"}
                  onClick={() => onOpen(h.id)}
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
  );
}
