"use client";

import type { TransitionKind } from "@/lib/editor-types";

/** Animated CSS demo of a transition between two cards. Remounts on replayKey. */
export function TransitionDemo({ kind, replayKey }: { kind: TransitionKind; replayKey: number }) {
  return (
    <div className="tr-demo tr-demo-lg" key={replayKey}>
      <div className="tr-card tr-a">A</div>
      <div className={`tr-card tr-b tr-${kind}`}>B</div>
    </div>
  );
}

/** A transition option chip with a favorite (star) toggle. */
export function TransitionChip({
  tr,
  active,
  fav,
  onPick,
  onFav,
}: {
  tr: { id: TransitionKind; label: string };
  active: boolean;
  fav: boolean;
  onPick: () => void;
  onFav: () => void;
}) {
  return (
    <span className={active ? "chip on tr-chip" : "chip tr-chip"}>
      <button className="tr-chip-pick" onClick={onPick}>
        {tr.label}
      </button>
      <button
        className={fav ? "tr-star on" : "tr-star"}
        onClick={onFav}
        title={fav ? "Remove favorite" : "Add favorite"}
        aria-label="Toggle favorite"
      >
        {fav ? "★" : "☆"}
      </button>
    </span>
  );
}
