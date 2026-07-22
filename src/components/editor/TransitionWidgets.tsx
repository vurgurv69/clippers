"use client";

import type { TransitionKind } from "@/lib/editor-types";

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
      <button type="button" className="tr-chip-pick" onClick={onPick}>
        {tr.label}
      </button>
      <button
        type="button"
        className={fav ? "tr-star on" : "tr-star"}
        onClick={onFav}
        title={fav ? "Remove favorite" : "Add favorite"}
        aria-label={fav ? `Unfavorite ${tr.label}` : `Favorite ${tr.label}`}
      >
        {fav ? "★" : "☆"}
      </button>
    </span>
  );
}
