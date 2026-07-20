"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
};

/** Spotlight-style command palette (Ctrl/Cmd+K). */
export function CommandPalette({ open, onClose, commands }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.slice(0, 24);
    return commands
      .filter(
        (c) =>
          c.label.toLowerCase().includes(needle) ||
          (c.hint || "").toLowerCase().includes(needle),
      )
      .slice(0, 24);
  }, [commands, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  function run(i: number) {
    const item = filtered[i];
    if (!item) return;
    onClose();
    item.run();
  }

  return (
    <div
      className="cmd-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-palette">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search commands, tools, panels…"
          aria-label="Search commands"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(active);
            }
          }}
        />
        <div className="cmd-list" role="listbox">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "cmd-item active" : "cmd-item"}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <span>
                {c.label}
                {c.hint ? (
                  <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
                    {c.hint}
                  </span>
                ) : null}
              </span>
              {c.shortcut ? <kbd>{c.shortcut}</kbd> : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="tool-hint" style={{ padding: 12 }}>
              No matching commands
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
