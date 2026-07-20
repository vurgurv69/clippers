"use client";

import { clipLane, clipLength, type MusicTrack, type TimelineClip } from "@/lib/editor-types";

export function TimelineMinimap({
  clips,
  starts,
  total,
  current,
  selectedIds,
  music,
  mainColor,
  overlayColor,
  onJump,
}: {
  clips: TimelineClip[];
  starts: number[];
  total: number;
  current: number;
  selectedIds: string[];
  music: MusicTrack | null;
  mainColor: string;
  overlayColor: string;
  onJump: (time: number, scrollFrac: number) => void;
}) {
  return (
    <div
      className="timeline-minimap"
      onPointerDown={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        onJump(frac * total, frac);
      }}
      title="Minimap — click to jump"
      role="slider"
      aria-label="Timeline minimap"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {clips.map((c, i) => (
        <span
          key={c.id}
          className={`mm-clip${clipLane(c) > 0 ? " ov" : ""}`}
          style={{
            left: `${total > 0 ? (starts[i] / total) * 100 : 0}%`,
            width: `${total > 0 ? (clipLength(c) / total) * 100 : 0}%`,
            background: selectedIds.includes(c.id)
              ? clipLane(c) > 0
                ? overlayColor
                : mainColor
              : clipLane(c) > 0
                ? "rgba(52,211,153,0.35)"
                : "rgba(16,185,129,0.45)",
          }}
        />
      ))}
      {music && (
        <span
          className="mm-music"
          style={{
            left: `${total > 0 ? (music.start / total) * 100 : 0}%`,
            width: `${total > 0 ? ((music.outPoint - music.inPoint) / total) * 100 : 0}%`,
          }}
        />
      )}
      <span
        className="mm-playhead"
        style={{ left: `${total > 0 ? (current / total) * 100 : 0}%` }}
      />
    </div>
  );
}
