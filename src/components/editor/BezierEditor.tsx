"use client";

import { useCallback, useRef } from "react";
import type { BezierHandles } from "@/lib/editor-types";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Interactive cubic-bezier editor: drag the two control points on the SVG,
 * or fine-tune with sliders.
 */
export function BezierEditor({
  value,
  onChange,
}: {
  value: BezierHandles;
  onChange: (next: BezierHandles) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [x1, y1, x2, y2] = value;

  const pointerToHandles = useCallback(
    (clientX: number, clientY: number, which: 0 | 1) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const nx = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const ny = clamp(1 - (clientY - rect.top) / Math.max(1, rect.height), -0.5, 1.5);
      const next: BezierHandles = [...valueRef.current];
      if (which === 0) {
        next[0] = nx;
        next[1] = ny;
      } else {
        next[2] = nx;
        next[3] = ny;
      }
      onChange(next);
    },
    [onChange],
  );

  function startDrag(which: 0 | 1, e: React.PointerEvent<SVGCircleElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerToHandles(e.clientX, e.clientY, which);
    const move = (ev: PointerEvent) => pointerToHandles(ev.clientX, ev.clientY, which);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="bezier-panel">
      <svg
        ref={svgRef}
        className="bezier-preview"
        viewBox="0 0 100 100"
        role="img"
        aria-label="Bezier easing curve"
      >
        <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(110,231,183,0.2)" strokeWidth="1" />
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="rgba(16,185,129,0.25)" />
        <line
          x1="0"
          y1="100"
          x2={x1 * 100}
          y2={100 - y1 * 100}
          stroke="rgba(251,191,36,0.5)"
          strokeWidth="1"
        />
        <line
          x1="100"
          y1="0"
          x2={x2 * 100}
          y2={100 - y2 * 100}
          stroke="rgba(251,191,36,0.5)"
          strokeWidth="1"
        />
        <path
          d={`M 0 100 C ${x1 * 100} ${100 - y1 * 100}, ${x2 * 100} ${100 - y2 * 100}, 100 0`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          className="bezier-handle"
          cx={x1 * 100}
          cy={100 - y1 * 100}
          r="5"
          fill="#fbbf24"
          onPointerDown={(e) => startDrag(0, e)}
        />
        <circle
          className="bezier-handle"
          cx={x2 * 100}
          cy={100 - y2 * 100}
          r="5"
          fill="#fbbf24"
          onPointerDown={(e) => startDrag(1, e)}
        />
      </svg>
      <p className="tool-hint">Drag the yellow handles, or use sliders</p>
      {(
        [
          ["x1", 0],
          ["y1", 1],
          ["x2", 2],
          ["y2", 3],
        ] as const
      ).map(([label, idx]) => (
        <Slider
          key={label}
          label={`Bezier ${label}`}
          min={idx % 2 === 0 ? 0 : -0.5}
          max={idx % 2 === 0 ? 1 : 1.5}
          value={value[idx]}
          onChange={(v) => {
            const next = [...value] as BezierHandles;
            next[idx] = v;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}
