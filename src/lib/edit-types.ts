/**
 * Edit spec produced by the in-browser editor and consumed by the ffmpeg
 * export route. Everything is expressed in seconds relative to the source
 * clip, and positions are relative (0..1) so preview and export stay in sync.
 */

/** A kept slice of the source clip. Ordered = final playback order. */
export type EditSegment = {
  id: string;
  start: number;
  end: number;
};

/** Color/contrast grade. Units are CSS-filter friendly (1 = unchanged). */
export type ColorAdjust = {
  brightness: number; // 0..2   (1 = normal)
  contrast: number; // 0..2   (1 = normal)
  saturation: number; // 0..3   (1 = normal)
};

export type TextOverlay = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number; // 0..1 (center anchor)
  y: number; // 0..1 (center anchor)
  size: number; // fraction of video width (e.g. 0.06)
  color: string; // #RRGGBB
  bold: boolean;
  background: boolean;
};

export type AudioTrack = {
  /** Stored file name inside the job's edit-assets folder. */
  filename?: string;
  volume: number; // 0..2 for the added track
  originalVolume: number; // 0..2 for the clip's own audio
};

export type TransitionKind = "none" | "fade" | "fadeblack" | "fadewhite";

export type EditSpec = {
  segments: EditSegment[];
  color: ColorAdjust;
  texts: TextOverlay[];
  audio: AudioTrack;
  /** Fade at the very start / end of the whole edit. */
  fadeIn: number;
  fadeOut: number;
  /** Transition inserted between each kept segment. */
  cutTransition: TransitionKind;
  cutTransitionDuration: number;
};

export const DEFAULT_COLOR: ColorAdjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

export function defaultEditSpec(duration: number): EditSpec {
  return {
    segments: [{ id: "seg-1", start: 0, end: Number(duration.toFixed(3)) }],
    color: { ...DEFAULT_COLOR },
    texts: [],
    audio: { volume: 1, originalVolume: 1 },
    fadeIn: 0,
    fadeOut: 0,
    cutTransition: "none",
    cutTransitionDuration: 0.4,
  };
}
