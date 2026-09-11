"use client";

import { useEffect, useId, useRef, useState } from "react";

function hslToHex(h: number, s: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHue(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function normalizeHex(raw: string, fallback = "#ffffff"): string {
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return fallback;
}

type Props = {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  disabled?: boolean;
};

/** Swatch button that opens an interactive hue wheel popover. */
export function ColorPickerPopover({ value, onChange, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const hex = normalizeHex(value);
  const hue = hexToHue(hex);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
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

  const fromPad = (el: HTMLElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const nextHue = (ang + 360) % 360;
    const sat = Math.min(1, Math.hypot(dx, dy) / (r.width * 0.42));
    onChange(hslToHex(nextHue, Math.max(0.12, sat), 0.52));
  };

  return (
    <div className="cpk-wrap" ref={wrapRef}>
      <button
        type="button"
        className="cpk-swatch"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        style={{ background: hex }}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="cpk-pop" id={id} role="dialog" aria-label={label}>
          <button
            type="button"
            className="cpk-wheel"
            aria-label="Color wheel"
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPad(e.currentTarget, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              fromPad(e.currentTarget, e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          >
            <span
              className="cpk-knob"
              style={{
                transform: `translate(-50%, -50%) rotate(${hue}deg) translateX(38px)`,
                background: hex,
              }}
            />
          </button>
          <div className="cpk-meta">
            <span className="cpk-hex">{hex}</span>
            <input
              type="color"
              className="cpk-native"
              value={hex}
              aria-label={`${label} fine tune`}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
