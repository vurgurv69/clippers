"use client";

import { useEffect, useRef } from "react";

/**
 * Visual peak meter — driven by play state + volume (no Web Audio graph,
 * so we never steal the media element's output).
 */
export function AudioMeter({
  media,
  channels = 2,
}: {
  media: HTMLMediaElement | null;
  channels?: 1 | 2;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    let phase = 0;
    const levels = [0, 0];

    const tick = () => {
      if (!alive) return;
      const canvas = canvasRef.current;
      const playing = Boolean(media && !media.paused && !media.ended);
      const vol = media ? Math.max(0, Math.min(1, media.volume)) : 0;
      phase += playing ? 0.18 : 0.04;
      const pulse = playing
        ? (0.35 + 0.55 * Math.abs(Math.sin(phase)) * vol)
        : vol * 0.08;
      levels[0] = levels[0] * 0.72 + pulse * 0.28;
      levels[1] = levels[1] * 0.68 + pulse * (0.22 + 0.15 * Math.abs(Math.cos(phase * 1.3)));

      if (canvas) {
        const g = canvas.getContext("2d");
        if (g) {
          const w = canvas.width;
          const h = canvas.height;
          g.clearRect(0, 0, w, h);
          const barW = Math.floor((w - 4) / channels);
          for (let c = 0; c < channels; c++) {
            const level = levels[c] || 0;
            const bh = Math.max(1, Math.round(level * (h - 2)));
            const x = c * (barW + 2) + 1;
            g.fillStyle = "rgba(255,255,255,0.06)";
            g.fillRect(x, 1, barW, h - 2);
            const grad = g.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, "#36d399");
            grad.addColorStop(0.72, "#f4b942");
            grad.addColorStop(1, "#e84d5b");
            g.fillStyle = grad;
            g.fillRect(x, h - 1 - bh, barW, bh);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [media, channels]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-meter"
      width={28}
      height={48}
      aria-hidden
      title="Audio levels"
    />
  );
}
