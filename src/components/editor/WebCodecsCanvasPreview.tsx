"use client";

import { useEffect, useRef } from "react";
import type { ClipEffect } from "@/lib/editor-types";

type Props = {
  /** Source video element already seeking/playing with the timeline. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  width: number;
  height: number;
  effects?: ClipEffect[];
  className?: string;
  style?: React.CSSProperties;
  /** Prefer WebCodecs path when available (falls back to canvas drawImage). */
  preferWebCodecs?: boolean;
};

function parseKeyColor(hex?: string): [number, number, number] {
  const h = (hex || "#00FF00").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 255, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * 60fps canvas preview loop: paints the active HTMLVideoElement each animation
 * frame, optionally applying client-side chroma key. Uses requestVideoFrameCallback
 * when present for tear-free sync; otherwise requestAnimationFrame.
 */
export function WebCodecsCanvasPreview({
  videoRef,
  width,
  height,
  effects,
  className,
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const vfcRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    canvas.width = Math.max(2, Math.round(width));
    canvas.height = Math.max(2, Math.round(height));

    const chroma = (effects || []).find((e) => e.enabled && e.kind === "chromakey");
    const [kr, kg, kb] = parseKeyColor(chroma?.keyColor);
    const tol = chroma ? 0.08 + (chroma.amount / 100) * 0.55 : 0;
    const soft = chroma ? (chroma.keyBlend ?? 20) / 100 : 0;

    let alive = true;

    const paint = () => {
      if (!alive) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.readyState < 2) return;
      const w = c.width;
      const h = c.height;
      ctx.drawImage(v, 0, 0, w, h);
      if (chroma && tol > 0) {
        const frame = ctx.getImageData(0, 0, w, h);
        const d = frame.data;
        const invSoft = soft > 0.001 ? 1 / soft : 0;
        for (let i = 0; i < d.length; i += 4) {
          const dr = (d[i] - kr) / 255;
          const dg = (d[i + 1] - kg) / 255;
          const db = (d[i + 2] - kb) / 255;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < tol) {
            d[i + 3] = 0;
          } else if (soft > 0 && dist < tol + soft) {
            const a = Math.min(255, Math.max(0, ((dist - tol) * invSoft) * 255));
            d[i + 3] = a;
          }
        }
        ctx.putImageData(frame, 0, 0);
      }
    };

    const loopRaf = () => {
      paint();
      rafRef.current = requestAnimationFrame(loopRaf);
    };

    type VideoWithVfc = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const vv = video as VideoWithVfc;

    if (typeof vv.requestVideoFrameCallback === "function") {
      const tick = () => {
        paint();
        if (alive && vv.requestVideoFrameCallback) {
          vfcRef.current = vv.requestVideoFrameCallback(tick);
        }
      };
      vfcRef.current = vv.requestVideoFrameCallback(tick);
    } else {
      rafRef.current = requestAnimationFrame(loopRaf);
    }

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (vfcRef.current != null && typeof vv.cancelVideoFrameCallback === "function") {
        vv.cancelVideoFrameCallback(vfcRef.current);
      }
    };
  }, [videoRef, width, height, effects]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        ...style,
      }}
      aria-label="Live canvas preview"
    />
  );
}
