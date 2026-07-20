"use client";

import { useMemo } from "react";
import type { ClipKeyframe, KeyframeProp } from "@/lib/editor-types";

const PROP_COLORS: Partial<Record<KeyframeProp, string>> = {
  opacity: "#5daeff",
  volume: "#36d399",
  x: "#f4b942",
  y: "#e84d5b",
  scaleX: "#29c3a9",
  scaleY: "#8b7cf7",
  rotation: "#f97316",
  brightness: "#eab308",
};

const PROPS: KeyframeProp[] = [
  "opacity",
  "volume",
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "brightness",
];

function samplesForProp(
  keyframes: ClipKeyframe[],
  prop: KeyframeProp,
): { t: number; value: number }[] {
  const out: { t: number; value: number }[] = [];
  for (const k of keyframes) {
    const v = k[prop];
    if (typeof v === "number") out.push({ t: k.t, value: v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Mini value graph for clip keyframes (read-only overview). */
export function KeyframeGraph({
  keyframes,
  duration,
}: {
  keyframes: ClipKeyframe[];
  duration: number;
}) {
  const paths = useMemo(() => {
    const w = 220;
    const h = 64;
    const dur = Math.max(0.1, duration);
    const out: { prop: KeyframeProp; d: string; color: string; dots: { x: number; y: number }[] }[] =
      [];
    for (const prop of PROPS) {
      const sorted = samplesForProp(keyframes, prop);
      if (sorted.length < 1) continue;
      const vals = sorted.map((k) => k.value);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const span = Math.max(1e-6, hi - lo);
      const dots = sorted.map((k) => ({
        x: (k.t / dur) * w,
        y: h - 4 - ((k.value - lo) / span) * (h - 8),
      }));
      const d = dots
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
      out.push({ prop, d, color: PROP_COLORS[prop] || "#a6afb8", dots });
    }
    return out;
  }, [keyframes, duration]);

  if (!keyframes.length || !paths.length) {
    return <p className="tool-hint">No keyframes — add some above to see the graph.</p>;
  }

  return (
    <div className="kf-graph">
      <svg viewBox="0 0 220 64" width="100%" height="64" aria-hidden>
        <rect x="0" y="0" width="220" height="64" fill="rgba(255,255,255,0.03)" rx="6" />
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={220 * t}
            y1="0"
            x2={220 * t}
            y2="64"
            stroke="rgba(255,255,255,0.06)"
          />
        ))}
        {paths.map((p) => (
          <g key={p.prop}>
            <path d={p.d} fill="none" stroke={p.color} strokeWidth="1.5" />
            {p.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="2.5" fill={p.color} />
            ))}
          </g>
        ))}
      </svg>
      <div className="kf-legend">
        {paths.map((p) => (
          <span key={p.prop} style={{ color: p.color }}>
            {p.prop}
          </span>
        ))}
      </div>
    </div>
  );
}
