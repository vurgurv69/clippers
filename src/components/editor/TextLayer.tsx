"use client";

import { useId, useMemo, type CSSProperties } from "react";
import type { TextOverlay, TextRun } from "@/lib/editor-types";
import { LottieSticker } from "@/components/editor/LottieSticker";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

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

/** Live text overlay — fade/slide, SVG bezier curve, rich runs, kerning. */
export function TextLayer({
  t,
  current,
  selected,
}: {
  t: TextOverlay;
  current: number;
  selected: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const local = current - t.start;
  const enterDur = 0.35;
  let opacity = 1;
  let translateY = 0;
  if (t.anim === "fade" || t.anim === "slide") {
    const fromEnd = t.start + t.duration - current;
    if (local < enterDur) opacity = clamp(local / enterDur, 0, 1);
    else if (fromEnd < enterDur) opacity = clamp(fromEnd / enterDur, 0, 1);
  }
  if (t.anim === "slide" && local < enterDur) {
    translateY = (1 - clamp(local / enterDur, 0, 1)) * 24;
  }

  const fpx = Math.max(1, t.size * 1080);
  const strokeEm = (t.stroke ?? 0) / fpx;
  const shadowEm = (t.shadow ?? 0) / fpx;
  const spacingEm = ((t.letterSpacing ?? 0) + (t.kerning ?? 0)) / fpx;
  const textOpacity = t.opacity ?? 1;
  const curve = clamp(t.curve ?? 0, -100, 100);
  const curved = Math.abs(curve) > 1;
  const runs = expandRuns(t);
  const plain = runs.map((r) => r.text).join("");

  const pathD = useMemo(() => {
    // Quadratic bezier arc across a unit box; curve maps to control-point height.
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

  const baseStyle: CSSProperties = {
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    transform: `translate(-50%, -50%) translateY(${translateY}px)`,
    opacity: opacity * textOpacity,
    color: t.color,
    fontFamily: t.font ? `"${t.font}", sans-serif` : undefined,
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
  };

  if (curved) {
    const pathId = `curve-${uid}`;
    return (
      <div className={`text-layer curved${selected ? " selected" : ""}`} style={baseStyle}>
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          style={{ overflow: "visible", display: "block" }}
          aria-hidden
        >
          <defs>
            <path id={pathId} d={pathD} fill="none" />
          </defs>
          <text
            fill={t.color}
            fontSize={Math.max(4, t.size * 40)}
            fontWeight={t.bold ? 800 : 500}
            fontStyle={t.italic ? "italic" : "normal"}
            letterSpacing={(t.letterSpacing ?? 0) + (t.kerning ?? 0)}
            style={{ fontFamily: t.font || undefined }}
          >
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {plain}
            </textPath>
          </text>
        </svg>
      </div>
    );
  }

  if (t.stickerUrl) {
    return (
      <div className={`text-layer sticker${selected ? " selected" : ""}`} style={{ ...baseStyle, width: `${t.size * 120}%`, height: "auto" }}>
        {t.stickerLottie ? (
          <LottieSticker src={t.stickerUrl} className="lottie-host" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.stickerUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
        )}
      </div>
    );
  }

  return (
    <div className={`text-layer${selected ? " selected" : ""}`} style={baseStyle}>
      {runs.map((r, i) => (
        <span
          key={i}
          style={{
            fontWeight: r.bold ? 800 : undefined,
            fontStyle: r.italic ? "italic" : undefined,
            textDecoration: r.underline ? "underline" : undefined,
            color: r.color || undefined,
          }}
        >
          {r.text}
        </span>
      ))}
    </div>
  );
}
