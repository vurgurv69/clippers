"use client";

import { TransitionPreview } from "@/components/editor/library/FxPreviewBox";
import { TRANSITION_DEFS, type TransitionKind } from "@/lib/editor-types";

const PRESETS = TRANSITION_DEFS.filter((t) => t.id !== "none").slice(0, 12);

type Props = {
  kind: TransitionKind;
  duration: number;
  onKind: (k: TransitionKind) => void;
  onDuration: (d: number) => void;
  onClose: () => void;
  onClear: () => void;
};

/** Compact flyout when a transition box on the timeline is clicked. */
export function TransitionEditPopover({
  kind,
  duration,
  onKind,
  onDuration,
  onClose,
  onClear,
}: Props) {
  const label = TRANSITION_DEFS.find((t) => t.id === kind)?.label || kind;
  return (
    <div className="tr-edit-pop" role="dialog" aria-label="Edit transition">
      <header className="tr-edit-head">
        <strong>{label}</strong>
        <button type="button" className="btn tiny ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="tr-edit-preview">
        <TransitionPreview kind={kind === "none" ? "crossfade" : kind} />
      </div>
      <label className="tr-edit-speed">
        <span>
          Length <em>{duration < 1 ? `${Math.round(duration * 1000)} ms` : `${duration.toFixed(1)} s`}</em>
        </span>
        <input
          type="range"
          min={0.15}
          max={2}
          step={0.05}
          value={duration}
          onChange={(e) => onDuration(Number(e.target.value))}
        />
      </label>
      <p className="tool-hint" style={{ margin: 0, fontSize: 10 }}>
        Longer = box grows to the right over the next clip.
      </p>
      <div className="tr-edit-kinds">
        {PRESETS.map((tr) => (
          <button
            key={tr.id}
            type="button"
            className={kind === tr.id ? "on" : undefined}
            onClick={() => onKind(tr.id)}
            title={tr.label}
          >
            {tr.label}
          </button>
        ))}
      </div>
      <button type="button" className="btn tiny ghost tr-edit-clear" onClick={onClear}>
        Remove transition
      </button>
    </div>
  );
}
