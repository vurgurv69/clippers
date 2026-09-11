"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CAPTION_FONTS, type CaptionFontFamily } from "@/lib/caption-style";

const FONT_STACK: Record<CaptionFontFamily, string> = {
  Montserrat: "var(--font-montserrat), Montserrat, sans-serif",
  TheBoldFont: "var(--font-montserrat), Impact, sans-serif",
  Poppins: "var(--font-poppins), Poppins, sans-serif",
  Inter: "var(--font-inter), Inter, sans-serif",
  Impact: "Impact, Haettenschweiler, sans-serif",
};

type Props = {
  value: CaptionFontFamily;
  onChange: (font: CaptionFontFamily) => void;
  disabled?: boolean;
  className?: string;
};

/** Font menu that renders each option in its own typeface. */
export function FontSelect({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

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
    <div className={`font-select ${className || ""}`} ref={wrapRef}>
      <button
        type="button"
        className="font-select-trigger csc-field"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: FONT_STACK[value] }}
      >
        {value}
        <span className="font-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="font-select-menu" id={id} role="listbox">
          {CAPTION_FONTS.map((font) => (
            <li key={font}>
              <button
                type="button"
                role="option"
                aria-selected={font === value}
                className={font === value ? "font-select-option on" : "font-select-option"}
                style={{ fontFamily: FONT_STACK[font] }}
                onClick={() => {
                  onChange(font);
                  setOpen(false);
                }}
              >
                {font}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { FONT_STACK };
