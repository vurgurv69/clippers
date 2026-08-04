"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

/** Lightweight playhead store — subscribers re-render without the full Studio shell. */
let time = 0;
const listeners = new Set<Listener>();

export const playbackClock = {
  get(): number {
    return time;
  },
  set(t: number) {
    if (time === t) return;
    time = t;
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function usePlaybackClock(): number {
  return useSyncExternalStore(
    playbackClock.subscribe,
    playbackClock.get,
    playbackClock.get,
  );
}
