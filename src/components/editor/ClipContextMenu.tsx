"use client";

import { clipLane, type MusicTrack, type TimelineClip } from "@/lib/editor-types";

export type ClipContextMenuState = {
  x: number;
  y: number;
  clipId: string;
};

type Props = {
  menu: ClipContextMenuState;
  clips: TimelineClip[];
  starts: number[];
  music: MusicTrack | null;
  onClose: () => void;
  onSeek: (t: number) => void;
  onSplitAtPlayhead: () => void;
  onDuplicate: (clipId: string) => void;
  onCopy: () => void;
  onAddOpacityKeyframe: (clipId: string) => void;
  onDetachAudio: (clipId: string) => void;
  onRelinkAudio: (clipId: string) => void;
  onMoveToLane: (clipId: string, lane: number) => void;
  onDelete: (clipId: string) => void;
  selectedIds?: string[];
  onCreateCompound?: () => void;
  onExplodeCompound?: (clipId: string) => void;
  onEditCompound?: (clipId: string) => void;
  onCreateMulticam?: () => void;
  onSetMulticamActive?: (clipId: string) => void;
};

export function ClipContextMenu({
  menu,
  clips,
  starts,
  music,
  onClose,
  onSeek,
  onSplitAtPlayhead,
  onDuplicate,
  onCopy,
  onAddOpacityKeyframe,
  onDetachAudio,
  onRelinkAudio,
  onMoveToLane,
  onDelete,
  selectedIds = [],
  onCreateCompound,
  onExplodeCompound,
  onEditCompound,
  onCreateMulticam,
  onSetMulticamActive,
}: Props) {
  const clip = clips.find((c) => c.id === menu.clipId);
  const clipIndex = clips.findIndex((c) => c.id === menu.clipId);
  const lane = clip ? clipLane(clip) : 0;
  const multiMain =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => {
      const c = clips.find((x) => x.id === id);
      return c && clipLane(c) === 0 && !c.compound;
    });

  return (
    <div
      className="ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <button
        role="menuitem"
        onClick={() => {
          onSeek(starts[clipIndex] || 0);
          onSplitAtPlayhead();
          onClose();
        }}
      >
        Split at playhead
      </button>
      {multiMain && onCreateCompound && (
        <button
          role="menuitem"
          onClick={() => {
            onCreateCompound();
            onClose();
          }}
        >
          Create compound sequence
        </button>
      )}
      {clip?.compound && onEditCompound && (
        <button
          role="menuitem"
          onClick={() => {
            onEditCompound(menu.clipId);
            onClose();
          }}
        >
          Edit compound
        </button>
      )}
      {clip?.compound && onExplodeCompound && (
        <button
          role="menuitem"
          onClick={() => {
            onExplodeCompound(menu.clipId);
            onClose();
          }}
        >
          Explode compound
        </button>
      )}
      {multiMain && onCreateMulticam && (
        <button
          role="menuitem"
          onClick={() => {
            onCreateMulticam();
            onClose();
          }}
        >
          Create multicam group
        </button>
      )}
      {clip?.multicamId && !clip.multicamActive && onSetMulticamActive && (
        <button
          role="menuitem"
          onClick={() => {
            onSetMulticamActive(menu.clipId);
            onClose();
          }}
        >
          Set as live multicam angle
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          onDuplicate(menu.clipId);
          onClose();
        }}
      >
        Duplicate
      </button>
      <button
        role="menuitem"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        Copy
      </button>
      <button
        role="menuitem"
        onClick={() => {
          onAddOpacityKeyframe(menu.clipId);
          onClose();
        }}
      >
        ◆ Opacity keyframe
      </button>
      <button
        role="menuitem"
        onClick={() => {
          onDetachAudio(menu.clipId);
          onClose();
        }}
      >
        Detach audio (linked)
      </button>
      {music?.linkedClipId === menu.clipId && (
        <button
          role="menuitem"
          onClick={() => {
            onRelinkAudio(menu.clipId);
            onClose();
          }}
        >
          Re-link audio
        </button>
      )}
      {lane !== 0 && (
        <button
          role="menuitem"
          onClick={() => {
            onMoveToLane(menu.clipId, 0);
            onClose();
          }}
        >
          Move to V1 Main
        </button>
      )}
      {lane !== 1 && (
        <button
          role="menuitem"
          onClick={() => {
            onMoveToLane(menu.clipId, 1);
            onClose();
          }}
        >
          Move to V2 Overlay
        </button>
      )}
      {lane < 2 && (
        <button
          role="menuitem"
          onClick={() => {
            onMoveToLane(menu.clipId, 2);
            onClose();
          }}
        >
          Move to V3 Overlay
        </button>
      )}
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          onDelete(menu.clipId);
          onClose();
        }}
      >
        Delete
      </button>
    </div>
  );
}
