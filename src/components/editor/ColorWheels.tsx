"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WheelProps = {
  label: string;
  value: number; // -100..100
  onChange: (v: number) => void;
  hue?: string;
};

/**
 * Lift / Gamma / Gain pad — full 2D drag inside the circle.
 * Vertical = strength (− down / + up). Horizontal also contributes so you can steer freely.
 */
export function ColorWheel({ label, value, onChange, hue = "#1f9d7a" }: WheelProps) {
  const padRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  /** Visual offset from center (−1..1); Y is inverted so up = positive. */
  const [pos, setPos] = useState({ x: 0, y: -value / 100 });

  useEffect(() => {
    if (dragging.current) return;
    setPos((p) => ({ x: p.x * 0.35, y: -value / 100 }));
  }, [value]);

  const applyFromEvent = useCallback(
    (el: HTMLElement, clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let nx = (clientX - cx) / (r.width * 0.42);
      let ny = (clientY - cy) / (r.height * 0.42);
      const len = Math.hypot(nx, ny);
      if (len > 1) {
        nx /= len;
        ny /= len;
      }
      setPos({ x: nx, y: ny });
      // Up = boost, down = cut; slight X influence so left/right still feels active
      const signed = Math.max(-1, Math.min(1, -ny * 0.92 + nx * 0.2));
      onChange(Math.round(signed * 100));
    },
    [onChange],
  );

  return (
    <div className="color-wheel">
      <button
        type="button"
        ref={padRef}
        className="cw-pad"
        style={{ ["--cw-hue" as string]: hue }}
        aria-label={`${label} ${value}`}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          applyFromEvent(e.currentTarget, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          applyFromEvent(e.currentTarget, e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onDoubleClick={() => {
          setPos({ x: 0, y: 0 });
          onChange(0);
        }}
      >
        <span
          className="cw-knob"
          style={{
            transform: `translate(calc(-50% + ${(pos.x * 28).toFixed(1)}px), calc(-50% + ${(pos.y * 28).toFixed(1)}px))`,
          }}
        />
      </button>
      <span className="cw-label">{label}</span>
      <span className="cw-val">{value > 0 ? `+${value}` : value}</span>
    </div>
  );
}

export function ColorWheelsRow({
  lift,
  gamma,
  gain,
  onChange,
}: {
  lift: number;
  gamma: number;
  gain: number;
  onChange: (patch: { lift?: number; gamma?: number; gain?: number }) => void;
}) {
  return (
    <div className="color-wheels">
      <ColorWheel label="Lift" value={lift} hue="#5b8fd9" onChange={(v) => onChange({ lift: v })} />
      <ColorWheel label="Gamma" value={gamma} hue="#1f9d7a" onChange={(v) => onChange({ gamma: v })} />
      <ColorWheel label="Gain" value={gain} hue="#d4a017" onChange={(v) => onChange({ gain: v })} />
    </div>
  );
}

const RECENT_KEY = "clippers.recentColors";
const MAX_RECENT = 12;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((c) => typeof c === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(hex: string) {
  const norm = hex.toLowerCase();
  const next = [norm, ...loadRecent().filter((c) => c !== norm)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

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

type HueWheelProps = {
  /** Current preview hex (optional). */
  value?: string;
  onPick: (hex: string) => void;
};

/** Full hue color wheel + recently used swatches (localStorage). */
export function HueColorWheel({ value = "#ffffff", onPick }: HueWheelProps) {
  const [recent, setRecent] = useState<string[]>([]);
  const [hex, setHex] = useState(value);
  const dragging = useRef(false);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    setHex(value);
  }, [value]);

  const commit = (next: string) => {
    setHex(next);
    setRecent(pushRecent(next));
    onPick(next);
  };

  const fromPad = (el: HTMLElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // −180..180, 0 = east
    const hue = (ang + 360) % 360;
    const sat = Math.min(1, Math.hypot(dx, dy) / (r.width * 0.42));
    commit(hslToHex(hue, Math.max(0.15, sat), 0.52));
  };

  const hue = hexToHue(hex);

  return (
    <div className="hue-wheel-wrap">
      <button
        type="button"
        className="hue-wheel-pad"
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
          className="hue-wheel-knob"
          style={{
            transform: `translate(-50%, -50%) rotate(${hue}deg) translateX(34px)`,
            background: hex,
          }}
        />
      </button>
      <div className="hue-wheel-meta">
        <label className="field row text-color-row">
          <span className="slider-title">Hex</span>
          <input
            type="color"
            value={hex}
            onChange={(e) => commit(e.target.value)}
          />
          <code className="hue-hex">{hex}</code>
        </label>
        <p className="tool-label">Recent</p>
        <div className="recent-colors">
          {recent.length === 0 ? (
            <span className="tool-hint">Pick colors — they’ll show up here.</span>
          ) : (
            recent.map((c) => (
              <button
                key={c}
                type="button"
                className={c === hex ? "recent-swatch on" : "recent-swatch"}
                style={{ background: c }}
                title={c}
                onClick={() => commit(c)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
