"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  DEFAULT_KEYMAP,
  saveKeymap,
  type ShortcutAction,
} from "@/hooks/useKeyboardShortcuts";

const ROWS: [ShortcutAction, string][] = [
  ["onPlayPause", "Play / Pause"],
  ["onSplit", "Split"],
  ["onDelete", "Delete"],
  ["onReverse", "J — Reverse"],
  ["onStop", "K — Stop"],
  ["onForward", "L — Forward"],
  ["onToggleMute", "Mute"],
  ["onAddMarker", "Add marker"],
  ["onPrevMarker", "Previous marker"],
  ["onNextMarker", "Next marker"],
  ["onSeekBack", "Step back"],
  ["onSeekForward", "Step forward"],
  ["onFirstFrame", "Start"],
  ["onLastFrame", "End"],
];

type Props = {
  keymap: Record<string, ShortcutAction>;
  setKeymap: Dispatch<SetStateAction<Record<string, ShortcutAction>>>;
  onClose: () => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
};

export function KeymapDialog({ keymap, setKeymap, onClose, pushToast }: Props) {
  return (
    <div className="export-backdrop" onClick={onClose}>
      <div
        className="export-dialog"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Keyboard shortcuts</h3>
        <p className="tool-hint">
          Click a key, then press a new key to remap. Ctrl combos stay fixed.
        </p>
        <div className="keymap-list">
          {ROWS.map(([action, label]) => {
            const key =
              Object.entries(keymap).find(([, a]) => a === action)?.[0] || "?";
            return (
              <button
                key={action}
                className="keymap-row"
                onClick={() => {
                  pushToast(`Press a key for “${label}”…`, "info");
                  const once = (e: KeyboardEvent) => {
                    e.preventDefault();
                    window.removeEventListener("keydown", once, true);
                    if (e.key === "Escape") return;
                    const next = { ...keymap };
                    for (const [k, a] of Object.entries(next)) {
                      if (a === action) delete next[k];
                    }
                    next[e.key] = action;
                    setKeymap(next);
                    saveKeymap(next);
                    pushToast(`Mapped ${e.key} → ${label}`, "success");
                  };
                  window.addEventListener("keydown", once, true);
                }}
              >
                <span>{label}</span>
                <kbd>{key === " " ? "Space" : key}</kbd>
              </button>
            );
          })}
        </div>
        <div className="chip-row">
          <button
            className="btn"
            onClick={() => {
              const next = { ...DEFAULT_KEYMAP };
              setKeymap(next);
              saveKeymap(next);
              pushToast("Shortcuts reset", "success");
            }}
          >
            Reset defaults
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
