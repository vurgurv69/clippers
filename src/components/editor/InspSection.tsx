"use client";

import { useState, type ReactNode } from "react";

/** Always-visible inspector block (no collapse — content stays on screen). */
export function PanelBlock({
  title,
  hint,
  children,
  filterMatch = true,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  filterMatch?: boolean;
}) {
  if (!filterMatch) return null;
  return (
    <div className="insp-block">
      <h4 className="insp-block-title">{title}</h4>
      {hint ? <p className="insp-section-hint">{hint}</p> : null}
      <div className="insp-block-body">{children}</div>
    </div>
  );
}

/** Optional collapsible section for advanced/extra groups. */
export function InspSection({
  id,
  title,
  hint,
  defaultOpen = true,
  children,
  filterMatch = true,
}: {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  filterMatch?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!filterMatch) return null;

  return (
    <div className={`insp-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="insp-section-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="insp-section-title">{title}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="insp-section-body">
          {hint ? <p className="insp-section-hint">{hint}</p> : null}
          {children}
        </div>
      )}
    </div>
  );
}

export function inspMatch(query: string, ...labels: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return labels.some((l) => l.toLowerCase().includes(q));
}
