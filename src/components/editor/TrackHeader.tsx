"use client";

import type { TrackChrome } from "@/lib/editor-types";

export type { TrackChrome };

/** Compact lane header: name + lock + mute only. */
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
    <div className={`track-header th-clean${track.collapsed ? " collapsed" : ""}`}>
      <span className="th-swatch" style={{ background: track.color }} />
      <span className="th-name-static" title={track.name}>
        {track.name}
        {count > 0 ? <em>{count}</em> : null}
      </span>
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
        M
      </button>
    </div>
  );
}
