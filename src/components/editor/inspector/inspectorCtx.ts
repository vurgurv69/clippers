"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  BezierHandles,
  ClipLayer,
  EffectKind,
  KeyframeEase,
  KeyframeProp,
  MusicTrack,
  ProjectAsset,
  TextOverlay,
  TimelineClip,
  TimelineMarker,
  ClipTransform,
  TransitionKind,
} from "@/lib/editor-types";

export type InspectorPanelCtx = {
  projectId: string;
  tab: string;
  selectedClip: TimelineClip | null;
  selectedAsset: ProjectAsset | null;
  selectedIds: string[];
  selectedText: TextOverlay | null;
  assets: ProjectAsset[];
  assetById: Map<string, ProjectAsset>;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  musicAsset: ProjectAsset | undefined;
  total: number;
  uploadingMusic: boolean;
  setUploadingMusic: Dispatch<SetStateAction<boolean>>;
  fxSearch: string;
  setFxSearch: Dispatch<SetStateAction<string>>;
  inspSearch?: string;
  trSearch: string;
  setTrSearch: Dispatch<SetStateAction<string>>;
  favTr: TransitionKind[];
  previewTransition: TransitionKind;
  setPreviewTransition: Dispatch<SetStateAction<TransitionKind>>;
  defaultEase: KeyframeEase;
  defaultBezier: BezierHandles;
  setDefaultBezier: Dispatch<SetStateAction<BezierHandles>>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  /** Phase 31 — split clip into graduated-speed pieces. */
  applySpeedRamp?: (clipId: string, kind: import("@/lib/speed-ramp").SpeedRampKind) => void;
  patchColor: (id: string, patch: Partial<TimelineClip["color"]>) => void;
  patchTransform: (id: string, patch: Partial<ClipTransform>) => void;
  patchMusic: (patch: Partial<MusicTrack>) => void;
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  mixerSolo: string | null;
  setMixerSolo: Dispatch<SetStateAction<string | null>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  addKeyframe: (clipId: string, prop: KeyframeProp) => void;
  removeNearbyKeyframe: (clipId: string) => void;
  copyKeyframes: (clipId: string) => void;
  pasteKeyframes: (clipId: string) => void;
  setAllKeyframeEase: (
    clipId: string,
    ease: KeyframeEase,
    bezier?: BezierHandles,
    onlyBezier?: boolean,
  ) => void;
  addEffect: (clipId: string, kind: EffectKind) => void;
  updateEffect: (
    clipId: string,
    fxId: string,
    patch: Partial<{ enabled: boolean; amount: number }>,
  ) => void;
  moveEffect: (clipId: string, fxId: string, dir: -1 | 1) => void;
  removeEffect: (clipId: string, fxId: string) => void;
  detachClipAudio: (clipId: string) => void;
  relinkClipAudio: (clipId: string | undefined) => void;
  onMusicFile: (f: File) => void;
  /** Extract audio from a video file into the music lane. */
  onExtractAudioFromVideo?: (f: File) => void | Promise<void>;
  /** Download audio from a YouTube URL into the music lane. */
  onImportYoutubeAudio?: (url: string) => void | Promise<void>;
  addText: () => void;
  addSticker: (glyph: string) => void;
  addPackSticker?: (src: string, label: string) => void;
  deleteText: (id: string) => void;
  applyTransition: () => void;
  toggleFav: (id: TransitionKind) => void;
  moveClip: (id: string, dir: -1 | 1) => void;
  duplicateClip: (id: string) => void;
  moveClipToLane: (id: string, lane: number) => void;
  deleteClip: (id: string) => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
  gradeClipboardRef: MutableRefObject<TimelineClip["color"] | null>;
  markers?: TimelineMarker[];
  addMarker?: () => void;
  patchMarker?: (id: string, patch: Partial<TimelineMarker>) => void;
  removeMarker?: (id: string) => void;
  addAdjustmentLayer?: () => void;
  addClipLayer?: (clipId: string, assetId: string, name?: string) => string | undefined;
  uploadClipLayerFile?: (clipId: string, file: File, name?: string) => Promise<string | undefined>;
  renameClipLayer?: (clipId: string, layerId: string, name: string) => void;
  removeClipLayer?: (clipId: string, layerId: string) => void;
  patchClipLayer?: (clipId: string, layerId: string, patch: Partial<ClipLayer>) => void;
  thumbUrl?: (a: ProjectAsset, t: number, w?: number) => string;
  assetUrl?: (a: ProjectAsset, opts?: { full?: boolean }) => string;
  useProxy?: boolean;
  onToggleProxy?: () => void;
  snapEnabled?: boolean;
  setSnapEnabled?: Dispatch<SetStateAction<boolean>>;
  magnetic?: boolean;
  setMagnetic?: Dispatch<SetStateAction<boolean>>;
  rippleEnabled?: boolean;
  setRippleEnabled?: Dispatch<SetStateAction<boolean>>;
  freeV1?: boolean;
  onToggleFreeV1?: () => void;
  setMulticamActive?: (clipId: string) => void;
  cutMulticamAtPlayhead?: (clipId: string) => void;
  syncMulticamGroup?: () => void | Promise<void>;
  clips?: TimelineClip[];
};

/** Identity helper so panels can destructure without repeating the type. */
export function panelCtx(ctx: InspectorPanelCtx): InspectorPanelCtx {
  return ctx;
}
