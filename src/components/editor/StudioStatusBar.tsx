"use client";

import type { AspectRatio } from "@/lib/types";

type Props = {
  clipCount: number;
  selectedCount: number;
  textCount: number;
  hasMusic: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  aspect: AspectRatio;
  fps: number;
  pxPerSec: number;
  current: number;
  total: number;
  fmt: (t: number) => string;
  tool?: string;
  workspace?: string;
  useProxy?: boolean;
  playing?: boolean;
  snap?: boolean;
  magnetic?: boolean;
  ripple?: boolean;
};

/** Quiet CapCut-style footer — essentials only. */
export function StudioStatusBar({
  clipCount,
  selectedCount,
  saving,
  lastSavedAt,
  aspect,
  fps,
  current,
  total,
  fmt,
  playing = false,
}: Props) {
  return (
    <footer className="studio-statusbar cc-status">
      <span>{playing ? "Playing" : "Ready"}</span>
      <span className="dot">·</span>
      <span>
        {clipCount} clip{clipCount === 1 ? "" : "s"}
        {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
      </span>
      <span className="status-spacer" />
      <span>
        {saving
          ? "Saving…"
          : lastSavedAt
            ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Unsaved"}
      </span>
      <span className="dot">·</span>
      <span>{aspect}</span>
      <span className="dot">·</span>
      <span>{fps} fps</span>
      <span className="dot">·</span>
      <span className="tc">
        {fmt(current)} / {fmt(total)}
      </span>
    </footer>
  );
}
