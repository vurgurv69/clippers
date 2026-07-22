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

export function TransitionsPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    trSearch,
    setTrSearch,
    favTr,
    previewTransition,
    setPreviewTransition,
    toggleFav,
    patchClip,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <InspSection id="tr-preview" title="Transition browser" filterMatch={inspMatch(ctx.inspSearch || "", "transition", "preview", "crossfade")}>
                      <p className="tool-hint">
                        {selectedClip
                          ? "Each card previews with two photos — click to apply on the selected clip."
                          : "Select a clip, then click a transition."}
                      </p>
                      <input
                        className="fx-search"
                        placeholder="Search transitions…"
                        value={trSearch}
                        onChange={(e) => setTrSearch(e.target.value)}
                      />
                      {favTr.length > 0 && !trSearch.trim() && (
                        <>
                          <p className="tool-sublabel">★ Favorites</p>
                          <div className="chip-row">
                            {TRANSITIONS.filter((t) => favTr.includes(t.id)).map((tr) => (
                              <TransitionChip
                                key={tr.id}
                                tr={tr}
                                active={
                                  previewTransition === tr.id ||
                                  selectedClip?.transition === tr.id
                                }
                                fav
                                onPick={() => {
                                  setPreviewTransition(tr.id);
                                  if (selectedClip) {
                                    patchClip(selectedClip.id, { transition: tr.id });
                                  }
                                }}
                                onFav={() => toggleFav(tr.id)}
                              />
                            ))}
                          </div>
                        </>
                      )}
                      <div className="cc-grid cc-grid-3">
                        {TRANSITIONS.filter(
                          (t) =>
                            t.id !== "none" &&
                            (!trSearch.trim() || t.label.toLowerCase().includes(trSearch.toLowerCase())),
                        ).map((tr) => {
                          const active =
                            previewTransition === tr.id || selectedClip?.transition === tr.id;
                          return (
                            <button
                              key={tr.id}
                              type="button"
                              className={active ? "cc-card fx-photo-card on" : "cc-card fx-photo-card"}
                              onClick={() => {
                                setPreviewTransition(tr.id);
                                if (selectedClip) {
                                  patchClip(selectedClip.id, { transition: tr.id });
                                }
                              }}
                            >
                              <span className="cc-card-thumb">
                                <TransitionPreview kind={tr.id} />
                              </span>
                              <span className="cc-card-label">{tr.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      </InspSection>

                      {selectedClip && (
                        <InspSection id="tr-current" title="Current clip" filterMatch={inspMatch(ctx.inspSearch || "", "length", "duration", "cut")}>
                          <p className="tool-label">Current clip transition</p>
                          <div className="chip-row">
                            <button
                              className={selectedClip.transition === "none" ? "chip on" : "chip"}
                              onClick={() => patchClip(selectedClip.id, { transition: "none" })}
                            >
                              <span>Cut</span>
                            </button>
                            {selectedClip.transition !== "none" && (
                              <span className="chip on">
                                <span>{TRANSITIONS.find((t) => t.id === selectedClip.transition)?.label}</span>
                              </span>
                            )}
                          </div>
                          <Slider
                            label="Transition length"
                            min={0.2}
                            max={2}
                            value={selectedClip.transitionDuration}
                            onChange={(v) => patchClip(selectedClip.id, { transitionDuration: v })}
                          />
                        </InspSection>
                      )}
      <p className="tool-hint">Transitions play into the next clip and render on export.</p>
    </div>
  );
}

