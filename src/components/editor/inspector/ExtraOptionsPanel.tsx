"use client";

import { useState } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { ColorWheelsRow, HueColorWheel } from "@/components/editor/ColorWheels";
import { TransitionChip } from "@/components/editor/TransitionWidgets";
import {
  EffectPreview,
  TransitionPreview,
} from "@/components/editor/library/FxPreviewBox";
import { TRANSITION_UI_IDS } from "@/lib/capcut-catalog";
import {
  COLOR_PRESETS,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  KEYFRAME_EASES,
  TRANSITION_DEFS,
  clipLane,
  clipLength,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type ProjectAsset,
  type TransitionKind,
} from "@/lib/editor-types";
import { InspSection, PanelBlock, inspMatch } from "@/components/editor/InspSection";
import { AudioMixerStrip } from "@/components/editor/AudioMixerStrip";
import { KeyframeGraph } from "@/components/editor/KeyframeGraph";
import { panelCtx, type InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

const TRANSITION_UI = new Set<string>(TRANSITION_UI_IDS);
const TRANSITIONS = TRANSITION_DEFS.filter(
  (t) => t.id === "none" || TRANSITION_UI.has(t.id),
);

export function ExtraOptionsPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    useProxy = true,
    onToggleProxy,
    snapEnabled = true,
    setSnapEnabled,
    magnetic = false,
    setMagnetic,
    rippleEnabled = false,
    setRippleEnabled,
    freeV1 = false,
    onToggleFreeV1,
  } = panelCtx(ctx);

  const toggles: {
    id: string;
    label: string;
    hint: string;
    on: boolean;
    set?: () => void;
  }[] = [
    {
      id: "proxy",
      label: "Proxy preview",
      hint: "Lighter files while scrubbing. Off = full quality in the monitor.",
      on: useProxy,
      set: onToggleProxy,
    },
    {
      id: "snap",
      label: "Snap",
      hint: "Clip edges pull to nearby clips and the playhead.",
      on: snapEnabled,
      set: setSnapEnabled ? () => setSnapEnabled((s) => !s) : undefined,
    },
    {
      id: "magnet",
      label: "Magnet",
      hint: "Stronger snap while dragging; gaps tend to close on release.",
      on: magnetic,
      set: setMagnetic ? () => setMagnetic((m) => !m) : undefined,
    },
    {
      id: "ripple",
      label: "Ripple",
      hint: "Deleting or shortening slides later clips left to close gaps.",
      on: rippleEnabled,
      set: setRippleEnabled ? () => setRippleEnabled((r) => !r) : undefined,
    },
    {
      id: "free",
      label: freeV1 ? "Free place (V1)" : "Pack gapless (V1)",
      hint: "Free lets main-track clips sit anywhere. Pack keeps them back-to-back.",
      on: freeV1,
      set: onToggleFreeV1,
    },
  ];

  return (
    <div className="tool">
      <InspSection
        id="extra-opts"
        title="Extra options"
        hint="Timeline behavior that used to crowd the bottom bar — toggle what you need."
        filterMatch={inspMatch(ctx.inspSearch || "", "proxy", "snap", "magnet", "ripple", "extra")}
      >
        <div className="extra-opts-list">
          {toggles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.on ? "extra-opt on" : "extra-opt"}
              onClick={() => t.set?.()}
              disabled={!t.set}
            >
              <span className="extra-opt-top">
                <strong>{t.label}</strong>
                <em>{t.on ? "On" : "Off"}</em>
              </span>
              <span className="extra-opt-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </InspSection>
    </div>
  );
}
