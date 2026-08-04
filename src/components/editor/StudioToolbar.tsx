"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolId } from "@/lib/edit-tools";

type Props = {
  tool: ToolId;
  onSetTool: (t: ToolId) => void;
  selectedId: string | null;
  onDuplicate: () => void;
  density?: "s" | "m" | "l";
};

const TOOLS: { id: ToolId; label: string; shortcut: string; glyph: string }[] = [
  { id: "select", label: "Pointer", shortcut: "V", glyph: "▸" },
  { id: "blade", label: "Blade", shortcut: "C", glyph: "✂" },
  { id: "trim", label: "Trim", shortcut: "T", glyph: "⟷" },
  { id: "ripple", label: "Ripple", shortcut: "R", glyph: "≋" },
  { id: "slip", label: "Slip", shortcut: "Y", glyph: "⇄" },
  { id: "slide", label: "Slide", shortcut: "U", glyph: "⇔" },
  { id: "roll", label: "Roll", shortcut: "N", glyph: "⟳" },
  { id: "hand", label: "Hand", shortcut: "H", glyph: "✋" },
  { id: "zoom", label: "Zoom", shortcut: "Z", glyph: "⌕" },
];

/** Studio 2.0 tool strip — larger hit targets, hover labels, density. */
export function StudioToolbar({
  tool,
  onSetTool,
  selectedId,
  onDuplicate,
  density = "m",
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
    <div
      className={`studio-toolbar pro-toolbar cc-toolbar-v2 density-${density}`}
      role="toolbar"
      aria-label="Editing tools"
      ref={wrapRef}
    >
      <div className="toolbar-group tool-rail" role="group" aria-label="Edit tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tool === t.id ? "tool-btn on" : "tool-btn"}
            title={`${t.label} (${t.shortcut})`}
            aria-label={`${t.label} (${t.shortcut})`}
            aria-pressed={tool === t.id}
            onClick={() => onSetTool(t.id)}
          >
            <span className="tool-glyph" aria-hidden>
              {t.glyph}
            </span>
            <span className="tool-tip">{t.label}</span>
          </button>
        ))}
      </div>

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
          <kbd>{active.shortcut}</kbd>
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
                  <span>
                    {t.glyph} {t.label}
                  </span>
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
