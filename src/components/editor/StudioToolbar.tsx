"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolId } from "@/lib/edit-tools";

type Props = {
  tool: ToolId;
  onSetTool: (t: ToolId) => void;
  selectedId: string | null;
  onDuplicate: () => void;
};

const TOOLS: { id: ToolId; label: string; shortcut: string }[] = [
  { id: "select", label: "Pointer", shortcut: "V" },
  { id: "blade", label: "Blade", shortcut: "C" },
  { id: "trim", label: "Trim", shortcut: "T" },
  { id: "ripple", label: "Ripple", shortcut: "R" },
  { id: "slip", label: "Slip", shortcut: "Y" },
  { id: "slide", label: "Slide", shortcut: "U" },
  { id: "roll", label: "Roll", shortcut: "N" },
  { id: "hand", label: "Hand", shortcut: "H" },
  { id: "zoom", label: "Zoom", shortcut: "Z" },
];

/** Slim edit strip: tool selector (left) · Duplicate (right). Split/Delete live on the timeline bar. */
export function StudioToolbar({
  tool,
  onSetTool,
  selectedId,
  onDuplicate,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = TOOLS.find((t) => t.id === tool) || TOOLS[0];
  const canEditClip = Boolean(selectedId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="studio-toolbar pro-toolbar" role="toolbar" aria-label="Editing tools" ref={wrapRef}>
      <div className="toolbar-group tool-selector-wrap">
        <button
          type="button"
          className="tool-selector"
          aria-expanded={open}
          aria-haspopup="listbox"
          title={`${active.label} tool (${active.shortcut})`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tool-selector-label">{active.label}</span>
          <span className="tool-selector-caret" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <ul className="tool-menu" role="listbox" aria-label="Edit tools">
            {TOOLS.map((t) => (
              <li key={t.id} role="option" aria-selected={tool === t.id}>
                <button
                  type="button"
                  className={tool === t.id ? "on" : undefined}
                  onClick={() => {
                    onSetTool(t.id);
                    setOpen(false);
                  }}
                >
                  <span>{t.label}</span>
                  <kbd>{t.shortcut}</kbd>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="toolbar-right">
        <button
          type="button"
          className="tool-btn"
          onClick={onDuplicate}
          disabled={!canEditClip}
          title="Duplicate (Ctrl+D)"
        >
          Duplicate
        </button>
      </div>
    </div>
  );
}

export type { ToolId };
