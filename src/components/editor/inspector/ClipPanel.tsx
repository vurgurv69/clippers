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

export function InspectorClipActions({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    tab,
    moveClip,
    duplicateClip,
    moveClipToLane,
    deleteClip,
  } = panelCtx(ctx);
  if (!selectedClip || tab === "text" || tab === "transitions") return null;
  return (
    <div className="inspector-actions">
      <button className="btn tiny" onClick={() => moveClip(selectedClip.id, -1)}>
        Move left
      </button>
      <button className="btn tiny" onClick={() => moveClip(selectedClip.id, 1)}>
        Move right
      </button>
      <button className="btn tiny" onClick={() => duplicateClip(selectedClip.id)}>
        Duplicate
      </button>
      <button
        className="btn tiny"
        onClick={() => {
          const lane = clipLane(selectedClip);
          const next = lane === 0 ? 1 : lane === 1 ? 2 : 0;
          moveClipToLane(selectedClip.id, next);
        }}
        title="Cycle track lane V1 → V2 → V3 → V1"
      >
        {clipLane(selectedClip) === 0
          ? "To V2"
          : clipLane(selectedClip) === 1
            ? "To V3"
            : "To V1"}
      </button>
      <button className="btn tiny danger" onClick={() => deleteClip(selectedClip.id)}>
        Delete
      </button>
    </div>
  );
}

function ClipLayersSection({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    selectedAsset,
    assets,
    assetById,
    addClipLayer,
    uploadClipLayerFile,
    renameClipLayer,
    removeClipLayer,
    thumbUrl,
  } = panelCtx(ctx);
  const [layerSearch, setLayerSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  const layers = selectedClip?.layers || [];
  const nextNum = layers.length + 1;
  const q = layerSearch.trim().toLowerCase();
  const mediaAssets = assets.filter((a) => a.kind === "video" || a.kind === "image");

  if (!selectedClip || !addClipLayer) return null;

  const base = {
    id: "__base",
    name: selectedAsset?.filename?.replace(/\.[^.]+$/, "") || "Base",
    assetId: selectedClip.assetId || undefined,
    enabled: true as boolean | undefined,
    isBase: true as const,
    index: 1,
  };
  const extras = layers.map((l, i) => ({
    ...l,
    isBase: false as const,
    index: i + 2,
  }));
  const rows = [base, ...extras].filter(
    (r) => !q || r.name.toLowerCase().includes(q) || `layer #${r.index}`.includes(q),
  );

  function beginAdd() {
    setDraftName(`Layer #${nextNum}`);
    setPicking(true);
  }

  async function addFromAsset(assetId: string) {
    if (!selectedClip || !addClipLayer) return;
    addClipLayer(selectedClip.id, assetId, draftName.trim() || `Layer #${nextNum}`);
    setPicking(false);
    setDraftName("");
  }

  async function addFromFile(file: File | undefined) {
    if (!file || !uploadClipLayerFile || !selectedClip) return;
    setBusy(true);
    try {
      await uploadClipLayerFile(
        selectedClip.id,
        file,
        draftName.trim() || `Layer #${nextNum}`,
      );
      setPicking(false);
      setDraftName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelBlock
      title={`Layers · ${1 + layers.length}`}
      hint="Stack video or photos on this clip. Every new layer needs real media from a file or the library."
      filterMatch={inspMatch(ctx.inspSearch || "", "layer", "overlay", "stack")}
    >
      <div className="clip-layers">
        <div className="clip-layers-toolbar">
          <input
            className="clip-layers-search"
            placeholder="Search layers…"
            value={layerSearch}
            onChange={(e) => setLayerSearch(e.target.value)}
            aria-label="Search layers"
          />
          <button
            type="button"
            className="clip-layer-icon-btn add"
            title="Add layer from file or library"
            onClick={beginAdd}
          >
            +
          </button>
        </div>

        {picking && (
          <div className="clip-layer-picker">
            <input
              className="clip-layer-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={`Layer #${nextNum}`}
              aria-label="New layer name"
            />
            <label className={`btn tiny${busy ? " disabled" : ""}`}>
              {busy ? "Uploading…" : "From file"}
              <input
                type="file"
                accept="video/*,image/*"
                hidden
                disabled={busy}
                onChange={(e) => {
                  void addFromFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="btn tiny ghost"
              onClick={() => {
                setPicking(false);
                setDraftName("");
              }}
            >
              Cancel
            </button>
            <p className="tool-hint">Or pick from library:</p>
            <div className="clip-layer-lib">
              {mediaAssets.length === 0 ? (
                <p className="tool-hint">No media yet — use From file.</p>
              ) : (
                mediaAssets.map((a) => {
                  const thumb = thumbUrl
                    ? thumbUrl(a, 0, 64)
                    : a.kind === "image" && ctx.assetUrl
                      ? ctx.assetUrl(a)
                      : null;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="clip-layer-lib-card"
                      title={a.filename}
                      onClick={() => void addFromAsset(a.id)}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" draggable={false} />
                      ) : (
                        <span>{a.kind === "image" ? "IMG" : "VID"}</span>
                      )}
                      <em>{a.filename.replace(/\.[^.]+$/, "").slice(0, 16)}</em>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="clip-layers-list">
          {rows.length === 0 ? (
            <p className="tool-hint">No layers match.</p>
          ) : (
            rows.map((row) => {
              const asset = row.assetId ? assetById.get(row.assetId) : null;
              const thumb =
                asset && thumbUrl
                  ? thumbUrl(asset, 0, 72)
                  : asset?.kind === "image" && ctx.assetUrl
                    ? ctx.assetUrl(asset)
                    : null;
              return (
                <div
                  key={row.id}
                  className={`clip-layer-row${row.enabled === false ? " off" : ""}${row.isBase ? " base" : ""}`}
                >
                  <span className="clip-layer-num" title={`Layer ${row.index}`}>
                    {row.index}
                  </span>
                  <div className="clip-layer-thumb" title={asset?.filename || row.name}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" draggable={false} />
                    ) : (
                      <span className="clip-layer-thumb-empty">{row.index}</span>
                    )}
                  </div>
                  <div className="clip-layer-meta">
                    {row.isBase ? (
                      <span className="clip-layer-label">{row.name}</span>
                    ) : (
                      <input
                        className="clip-layer-label-input"
                        value={row.name}
                        onChange={(e) => renameClipLayer?.(selectedClip.id, row.id, e.target.value)}
                        aria-label="Layer name"
                      />
                    )}
                    <span className="clip-layer-sub">
                      {asset
                        ? `${asset.kind === "image" ? "Photo" : "Video"} · ${asset.filename}`
                        : row.isBase
                          ? "Base clip"
                          : "No media"}
                    </span>
                  </div>
                  {!row.isBase && (
                    <button
                      type="button"
                      className="clip-layer-icon-btn del"
                      title="Delete layer"
                      onClick={() => removeClipLayer?.(selectedClip.id, row.id)}
                    >
                      −
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </PanelBlock>
  );
}

/** Clip tab — layers only. */
export function ClipPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const { selectedClip, selectedText, patchText } = panelCtx(ctx);
  if (selectedText && !selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Text selected — edit it in the Text tab.</p>
        <Slider
          label="Start"
          hint="When the title appears on the timeline."
          min={0}
          max={120}
          value={selectedText.start}
          onChange={(v) => patchText(selectedText.id, { start: v })}
        />
        <Slider
          label="Duration"
          hint="How long the title stays on screen."
          min={0.2}
          max={60}
          value={selectedText.duration}
          onChange={(v) => patchText(selectedText.id, { duration: v })}
        />
      </div>
    );
  }
  if (!selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Select a clip to manage its layers.</p>
      </div>
    );
  }
  return (
    <div className="tool">
      <ClipLayersSection ctx={ctx} />
    </div>
  );
}
