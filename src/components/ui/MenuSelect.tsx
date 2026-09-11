"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MenuOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

/** Frosted button menu — replaces bland native `<select>` lists. */
export function MenuSelect({ value, options, onChange, disabled, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={open ? "menu-select open" : "menu-select"} ref={wrapRef}>
      <button
        type="button"
        className="menu-select-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="menu-select-value">{current?.label}</span>
        <span className="menu-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="menu-select-menu" id={id} role="listbox">
          {options.map((opt) => {
            const on = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={on ? "menu-select-option on" : "menu-select-option"}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
