"use client";

import { useCallback, useRef } from "react";

type WheelProps = {
  label: string;
  value: number; // -100..100
  onChange: (v: number) => void;
  hue?: string; // accent ring color
};

/** Compact lift/gamma/gain style color wheel (drag = bipolar amount). */
export function ColorWheel({ label, value, onChange, hue = "#1f9d7a" }: WheelProps) {
  const dragging = useRef(false);
  const applyFromEvent = useCallback(
    (el: HTMLElement, clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.min(1, Math.hypot(dx, dy) / (r.width * 0.42));
      // Vertical axis drives the bipolar grade (up = +gain, down = −)
      const signed = Math.max(-1, Math.min(1, (-dy / (r.height * 0.42)) * dist + (dx / (r.width * 0.8)) * 0.15));
      onChange(Math.round(signed * 100));
    },
    [onChange],
  );

  const angle = (value / 100) * 55;
  const mag = Math.abs(value) / 100;

  return (
    <div className="color-wheel">
      <button
        type="button"
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
        onDoubleClick={() => onChange(0)}
      >
        <span
          className="cw-knob"
          style={{
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${(-mag * 28).toFixed(1)}px)`,
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
