"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock, parseClockTime } from "@/lib/parse-time";

const SCALE_OPTIONS = [
  { id: "30m", label: "30 min", seconds: 30 * 60 },
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "2h", label: "2 hours", seconds: 2 * 60 * 60 },
] as const;

type ScaleId = (typeof SCALE_OPTIONS)[number]["id"];

type Props = {
  start: string;
  end: string;
  onChange: (patch: { manualStartTime: string; manualEndTime: string }) => void;
  disabled?: boolean;
};

function toSec(raw: string, fallback: number) {
  return parseClockTime(raw) ?? fallback;
}

/**
 * Always-visible dual-thumb range (green start · red end).
 * Scale: 30 min / 1 hour / 2 hours. Full-width selection = no manual limit.
 */
export function TimeRangeSlider({ start, end, onChange, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<"start" | "end" | null>(null);
  const [scaleId, setScaleId] = useState<ScaleId>("30m");

  const max = SCALE_OPTIONS.find((o) => o.id === scaleId)?.seconds ?? 1800;

  const hasTimes = Boolean(start.trim() || end.trim());
  const startSec = hasTimes
    ? Math.max(0, Math.min(toSec(start, 0), max - 1))
    : 0;
  const endSec = hasTimes
    ? Math.max(startSec + 1, Math.min(toSec(end, max), max))
    : max;

  const commit = useCallback(
    (s: number, e: number) => {
      const nextS = Math.max(0, Math.min(e - 1, Math.round(s)));
      const nextE = Math.min(max, Math.max(nextS + 1, Math.round(e)));
      // Full scale → clear so the picker uses the whole video
      if (nextS <= 0 && nextE >= max - 1) {
        onChange({ manualStartTime: "", manualEndTime: "" });
        return;
      }
      onChange({
        manualStartTime: formatClock(nextS),
        manualEndTime: formatClock(nextE),
      });
    },
    [max, onChange],
  );

  // If times exceed a newly chosen shorter scale, clamp them.
  useEffect(() => {
    if (!hasTimes) return;
    if (endSec <= max && startSec < max) return;
    commit(Math.min(startSec, max - 1), Math.min(endSec, max));
  }, [max]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    // Thumbs live inside padded rail — map against inner width only.
    const pad = 12;
    const inner = Math.max(1, r.width - pad * 2);
    const t = Math.max(0, Math.min(1, (clientX - r.left - pad) / inner));
    return t * max;
  };

  const onPointer = (which: "start" | "end", clientX: number) => {
    const t = fromClientX(clientX);
    if (which === "start") commit(t, endSec);
    else commit(startSec, t);
  };

  const startPct = (startSec / max) * 100;
  const endPct = (endSec / max) * 100;
  const isFull = !hasTimes || (startSec <= 0 && endSec >= max - 1);

  return (
    <div className="trs-block on">
      <div className="trs-head">
        <p className="csc-label" style={{ margin: 0 }}>
          Clip a section
        </p>
        <span className="trs-clock">
          {isFull ? (
            <span className="trs-full-lab">Full video</span>
          ) : (
            <>
              <span className="trs-start-lab">{formatClock(startSec)}</span>
              <span aria-hidden> – </span>
              <span className="trs-end-lab">{formatClock(endSec)}</span>
            </>
          )}
        </span>
      </div>

      <div className="trs-scales" role="group" aria-label="Timeline length">
        {SCALE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            aria-pressed={scaleId === opt.id}
            className={scaleId === opt.id ? "trs-scale on" : "trs-scale"}
            onClick={() => setScaleId(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div
        className="trs-track"
        ref={trackRef}
        role="group"
        aria-label="Start and end time"
        onPointerDown={(e) => {
          if (disabled) return;
          const t = fromClientX(e.clientX);
          const mid = (startSec + endSec) / 2;
          const which = t < mid ? "start" : "end";
          drag.current = which;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onPointer(which, e.clientX);
        }}
        onPointerMove={(e) => {
          if (!drag.current || disabled) return;
          onPointer(drag.current, e.clientX);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="trs-rail">
          <div
            className="trs-fill"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <button
            type="button"
            className="trs-thumb start"
            aria-label="Start time"
            disabled={disabled}
            style={{ left: `${startPct}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (disabled) return;
              drag.current = "start";
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current !== "start") return;
              onPointer("start", e.clientX);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
          <button
            type="button"
            className="trs-thumb end"
            aria-label="End time"
            disabled={disabled}
            style={{ left: `${endPct}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (disabled) return;
              drag.current = "end";
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current !== "end") return;
              onPointer("end", e.clientX);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        </div>
      </div>

      <div className="trs-ticks" aria-hidden>
        <span>0:00</span>
        <span>{formatClock(Math.floor(max / 2))}</span>
        <span>{formatClock(max)}</span>
      </div>

      <p className="csc-hint">
        Green = start · Red = end. Drag to set a section, or leave full for the whole video.
      </p>
    </div>
  );
}
