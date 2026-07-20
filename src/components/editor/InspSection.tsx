"use client";

import { useEffect, useState, type ReactNode } from "react";

const OPEN_KEY = "clippers.insp.sections";

function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Collapsible inspector section — remembers open state per id. */
export function InspSection({
  id,
  title,
  defaultOpen = true,
  children,
  filterMatch = true,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** When false, hide entire section (inspector search). */
  filterMatch?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    const saved = loadOpen();
    return typeof saved[id] === "boolean" ? saved[id] : defaultOpen;
  });

  useEffect(() => {
    const all = loadOpen();
    all[id] = open;
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }, [id, open]);

  if (!filterMatch) return null;

  return (
    <div className={`insp-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="insp-section-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="insp-section-body">{children}</div>}
    </div>
  );
}

export function inspMatch(query: string, ...labels: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return labels.some((l) => l.toLowerCase().includes(q));
}
