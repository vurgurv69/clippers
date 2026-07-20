"use client";

import type { TrackChrome } from "@/lib/editor-types";

export type { TrackChrome };

/** Compact lane header: rename, lock, mute, solo, hide, collapse, height. */
export function TrackHeader({
  track,
  onPatch,
  count,
}: {
  track: TrackChrome;
  onPatch: (p: Partial<TrackChrome>) => void;
  count: number;
}) {
  return (
    <div className={`track-header${track.collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="th-btn"
        title={track.collapsed ? "Expand track" : "Collapse track"}
        aria-label={track.collapsed ? "Expand" : "Collapse"}
        onClick={() => onPatch({ collapsed: !track.collapsed })}
      >
        {track.collapsed ? "▸" : "▾"}
      </button>
      <span className="th-swatch" style={{ background: track.color }} />
      <input
        className="th-name"
        value={track.name}
        onChange={(e) => onPatch({ name: e.target.value })}
        aria-label="Track name"
      />
      <span className="th-count">{count}</span>
      <button
        className={track.locked ? "th-btn on" : "th-btn"}
        title="Lock track"
        onClick={() => onPatch({ locked: !track.locked })}
      >
        {track.locked ? "🔒" : "🔓"}
      </button>
      <button
        className={track.muted ? "th-btn on" : "th-btn"}
        title="Mute track"
        onClick={() => onPatch({ muted: !track.muted })}
      >
        {track.muted ? "M" : "M"}
      </button>
      <button
        className={track.solo ? "th-btn on" : "th-btn"}
        title="Solo track"
        onClick={() => onPatch({ solo: !track.solo })}
      >
        S
      </button>
      <button
        className={track.hidden ? "th-btn on" : "th-btn"}
        title="Hide track"
        onClick={() => onPatch({ hidden: !track.hidden })}
      >
        {track.hidden ? "◌" : "●"}
      </button>
      {!track.collapsed && (
        <input
          className="th-height"
          type="range"
          min={28}
          max={110}
          value={track.height}
          onChange={(e) => onPatch({ height: Number(e.target.value) })}
          title="Track height"
          aria-label="Track height"
        />
      )}
    </div>
  );
}
