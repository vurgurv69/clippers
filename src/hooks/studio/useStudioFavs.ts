"use client";

import { useCallback, useEffect, useState } from "react";
import type { TransitionKind } from "@/lib/editor-types";

const TR_FAV_KEY = "clippers.fav.transitions";
const ASSET_FAV_KEY = "clippers.fav.assets";

/** Persist transition + media-bin favorites in localStorage. */
export function useStudioFavs() {
  const [favTr, setFavTr] = useState<TransitionKind[]>([]);
  const [favAssets, setFavAssets] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(ASSET_FAV_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TR_FAV_KEY);
      if (raw) setFavTr(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const toggleFav = useCallback((id: TransitionKind) => {
    setFavTr((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(TR_FAV_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleFavAsset = useCallback((id: string) => {
    setFavAssets((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(ASSET_FAV_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { favTr, toggleFav, favAssets, toggleFavAsset };
}
