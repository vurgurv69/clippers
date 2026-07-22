"use client";

import { memo, useEffect, useId, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { TextOverlay, TextRun } from "@/lib/editor-types";
import { clamp } from "@/lib/edit-tools";
import { LottieSticker } from "@/components/editor/LottieSticker";

function hexToRgba(hex: string, a: number) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  const rgb = m ? m[1] : "000000";
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function applyCase(s: string, tf?: string) {
  if (tf === "upper") return s.toUpperCase();
  if (tf === "lower") return s.toLowerCase();
  return s;
}

function expandRuns(t: TextOverlay): TextRun[] {
  if (t.runs?.length) {
    return t.runs.map((r) => ({ ...r, text: applyCase(r.text, t.transform) }));
  }
  return [
    {
      text: applyCase(t.text, t.transform),
      bold: t.bold,
      italic: t.italic,
      underline: t.underline,
      color: t.color,
    },
  ];
}

/** Reliable stacks so missing faces never blank the overlay. */
function fontStack(name?: string) {
  const n = (name || "Arial").trim();
  return `"${n}", "Segoe UI", Arial, Helvetica, sans-serif`;
}

/** Live text overlay — drag to move, corner handle to zoom, fonts stay stable. */
export const TextLayer = memo(function TextLayer({
  t,
  current,
  selected,
  projectId,
  onSelect,
  onPatch,
}: {
  t: TextOverlay;
  current: number;
  selected: boolean;
  projectId?: string;
  onSelect?: (id: string) => void;
  onPatch?: (id: string, patch: Partial<TextOverlay>) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const dragRef = useRef<{
    mode: "move" | "scale";
    x0: number;
    y0: number;
    startX: number;
    startY: number;
    startSize: number;
  } | null>(null);

  const local = current - t.start;
  const enterDur = 0.35;
  let opacity = 1;
  let translateY = 0;
  if (t.anim === "fade" || t.anim === "slide") {
    const fromEnd = t.start + t.duration - current;
    if (local < enterDur) {
      opacity = clamp(0.7 + 0.3 * (local / enterDur), 0, 1);
    } else if (fromEnd < enterDur) {
      opacity = clamp(fromEnd / enterDur, 0, 1);
    }
  }
  if ((t.anim === "pop" || t.anim === "zoom") && local < enterDur) {
    opacity = clamp(0.55 + 0.45 * (local / enterDur), 0, 1);
  }
  if (t.anim === "slide" && local < enterDur) {
    translateY = (1 - clamp(local / enterDur, 0, 1)) * 24;
  }

  // Load uploaded font files so custom faces actually render.
  useEffect(() => {
    if (!t.fontFile || !projectId) return;
    const family = (t.font || t.fontFile.replace(/\.[^.]+$/, "")).trim();
    const id = `cc-font-${t.fontFile.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    const url = `/api/editor/project/${projectId}/asset/${encodeURIComponent(t.fontFile)}`;
    style.textContent = `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
    document.head.appendChild(style);
  }, [t.fontFile, t.font, projectId]);

  const fpx = Math.max(1, t.size * 1080);
  const strokeEm = (t.stroke ?? 0) / fpx;
  const shadowEm = (t.shadow ?? 0) / fpx;
  const spacingEm = ((t.letterSpacing ?? 0) + (t.kerning ?? 0)) / fpx;
  const textOpacity = t.opacity ?? 1;
  const curve = clamp(t.curve ?? 0, -100, 100);
  const curved = Math.abs(curve) > 1;
  const runs = expandRuns(t);
  const plain = runs.map((r) => r.text).join("") || "Your text";

  const pathD = useMemo(() => {
    const bend = (curve / 100) * 40;
    return `M 0 50 Q 50 ${50 - bend} 100 50`;
  }, [curve]);

  const shadows: string[] = [];
  if (!t.bg && strokeEm > 0) {
    const s = strokeEm.toFixed(3);
    const col = t.strokeColor || "#000000";
    shadows.push(
      `-${s}em -${s}em 0 ${col}`,
      `${s}em -${s}em 0 ${col}`,
      `-${s}em ${s}em 0 ${col}`,
      `${s}em ${s}em 0 ${col}`,
    );
  }
  if (shadowEm > 0) {
    shadows.push(
      `${shadowEm.toFixed(3)}em ${shadowEm.toFixed(3)}em ${shadowEm.toFixed(3)}em ${t.shadowColor || "#000000"}`,
    );
  }

  function beginDrag(e: ReactPointerEvent, mode: "move" | "scale") {
    if (!onPatch) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(t.id);
    const parent = (e.currentTarget as HTMLElement).closest(".studio-preview") as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    dragRef.current = {
      mode,
      x0: e.clientX,
      y0: e.clientY,
      startX: t.x,
      startY: t.y,
      startSize: t.size,
    };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.mode === "move") {
        const nx = clamp(d.startX + (ev.clientX - d.x0) / Math.max(1, rect.width), 0.05, 0.95);
        const ny = clamp(d.startY + (ev.clientY - d.y0) / Math.max(1, rect.height), 0.05, 0.95);
        onPatch(t.id, { x: nx, y: ny });
      } else {
        const delta = (ev.clientX - d.x0) / Math.max(1, rect.width);
        onPatch(t.id, { size: clamp(d.startSize + delta * 0.35, 0.02, 0.35) });
      }
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const baseStyle: CSSProperties = {
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    transform: `translate(-50%, -50%) translateY(${translateY}px)`,
    opacity: opacity * textOpacity,
    color: t.color,
    fontFamily: fontStack(t.font),
    fontWeight: t.bold ? 800 : 500,
    fontStyle: t.italic ? "italic" : "normal",
    textDecoration: t.underline ? "underline" : undefined,
    textAlign: t.align,
    fontSize: `${t.size * 100}cqw`,
    letterSpacing: spacingEm ? `${spacingEm.toFixed(3)}em` : undefined,
    lineHeight: t.lineHeight ?? undefined,
    textShadow: shadows.length ? shadows.join(", ") : undefined,
    background: t.bg ? hexToRgba(t.bgColor || "#000000", t.bgOpacity ?? 0.6) : undefined,
    padding: t.bg ? "0.15em 0.4em" : undefined,
    borderRadius: t.bg ? "0.15em" : undefined,
    cursor: onPatch ? "move" : undefined,
    pointerEvents: "auto",
    zIndex: selected ? 14 : 12,
  };

  const body = curved ? (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ overflow: "visible", display: "block" }}
      aria-hidden
    >
      <defs>
        <path id={`curve-${uid}`} d={pathD} fill="none" />
      </defs>
      <text
        fill="currentColor"
        fontSize={Math.max(4, t.size * 40)}
        fontWeight={t.bold ? 800 : 500}
        fontStyle={t.italic ? "italic" : "normal"}
        style={{ fontFamily: fontStack(t.font) }}
      >
        <textPath href={`#curve-${uid}`} startOffset="50%" textAnchor="middle">
          {plain}
        </textPath>
      </text>
    </svg>
  ) : t.stickerUrl ? (
    <LottieSticker src={t.stickerUrl} />
  ) : (
    <span className="text-layer-runs">
      {runs.map((r, i) => (
        <span
          key={i}
          style={{
            color: r.color || undefined,
            fontWeight: r.bold ? 800 : undefined,
            fontStyle: r.italic ? "italic" : undefined,
            textDecoration: r.underline ? "underline" : undefined,
          }}
        >
          {r.text}
        </span>
      ))}
    </span>
  );

  return (
    <div
      className={`text-layer${selected ? " selected" : ""}${curved ? " curved" : ""}`}
      style={baseStyle}
      onPointerDown={(e) => {
        onSelect?.(t.id);
        if (e.button === 0) beginDrag(e, "move");
      }}
      onWheel={(e) => {
        if (!onPatch) return;
        e.stopPropagation();
        e.preventDefault();
        const next = clamp(t.size + (e.deltaY > 0 ? -0.008 : 0.008), 0.02, 0.35);
        onPatch(t.id, { size: next });
      }}
      title="Drag to move · scroll / corner to zoom"
    >
      {body}
      {selected && onPatch && (
        <button
          type="button"
          className="text-scale-handle"
          aria-label="Resize text"
          onPointerDown={(e) => beginDrag(e, "scale")}
        />
      )}
    </div>
  );
});
