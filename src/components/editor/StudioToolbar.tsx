"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolId } from "@/lib/edit-tools";

type Props = {
  tool: ToolId;
  onSetTool: (t: ToolId) => void;
  selectedId: string | null;
  selectedTextId: string | null;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
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

/**
 * Slim edit strip: one Tool Selector + Split.
 * Duplicate / Delete live in a More menu to cut permanent chrome.
 */
export function StudioToolbar({
  tool,
  onSetTool,
  selectedId,
  selectedTextId,
  onSplit,
  onDuplicate,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = TOOLS.find((t) => t.id === tool) || TOOLS[0];

  useEffect(() => {
    if (!open && !moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, moreOpen]);

  return (
    <div className="studio-toolbar pro-toolbar" role="toolbar" aria-label="Editing tools" ref={wrapRef}>
      <div className="toolbar-group tool-selector-wrap">
        <button
          type="button"
          className="tool-selector"
          aria-expanded={open}
          aria-haspopup="listbox"
          title={`${active.label} tool (${active.shortcut})`}
          onClick={() => {
            setOpen((v) => !v);
            setMoreOpen(false);
          }}
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

      <span className="toolbar-divider" aria-hidden />

      <button type="button" className="tool-btn primary-lite" onClick={onSplit} title="Split at playhead (S)">
        Split
      </button>

      <span className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          type="button"
          className="tool-btn ghost"
          onClick={() => {
            setMoreOpen((v) => !v);
            setOpen(false);
          }}
          aria-expanded={moreOpen}
          title="More edit actions"
        >
          More ▾
        </button>
        {moreOpen && (
          <ul className="tool-menu tool-menu-right" role="menu">
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={!selectedId}
                onClick={() => {
                  onDuplicate();
                  setMoreOpen(false);
                }}
              >
                Duplicate
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="danger"
                disabled={!selectedId && !selectedTextId}
                onClick={() => {
                  onDelete();
                  setMoreOpen(false);
                }}
              >
                Delete
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

export type { ToolId };
