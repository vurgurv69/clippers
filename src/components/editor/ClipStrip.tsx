"use client";

import { memo, useMemo } from "react";
import type { ProjectAsset, TimelineClip } from "@/lib/editor-types";
import { clamp } from "@/lib/edit-tools";

/** Filmstrip of thumbnails drawn behind a video/image clip on the timeline. */
export const ClipStrip = memo(function ClipStrip({
  asset,
  clip,
  width,
  url,
}: {
  asset: ProjectAsset;
  clip: TimelineClip;
  width: number;
  url: (a: ProjectAsset, t: number, w?: number) => string;
}) {
  const tiles = useMemo(() => {
    const tileW = 84;
    const n = clamp(Math.floor(width / tileW), 1, 12);
    const span = clip.outPoint - clip.inPoint;
    const arr: { key: number; left: number; w: number; t: number }[] = [];
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0.5 : i / (n - 1);
      const t = asset.kind === "image" ? 0 : clip.inPoint + frac * span;
      arr.push({ key: i, left: (i / n) * 100, w: 100 / n + 0.5, t });
    }
    return arr;
  }, [asset.kind, clip.inPoint, clip.outPoint, width]);

  return (
    <div className="clip-strip" aria-hidden>
      {tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tile.key}
          src={url(asset, tile.t, 120)}
          style={{ left: `${tile.left}%`, width: `${tile.w}%` }}
          loading="lazy"
          decoding="async"
          draggable={false}
          alt=""
        />
      ))}
    </div>
  );
});
