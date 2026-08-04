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
  type DelogoCorner,
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

const DELOGO_CORNERS: { id: DelogoCorner; label: string; hint: string }[] = [
  { id: "tl", label: "Top left", hint: "TL" },
  { id: "tr", label: "Top right", hint: "TR" },
  { id: "bl", label: "Bottom left", hint: "BL" },
  { id: "br", label: "Bottom right", hint: "BR" },
];

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
  void moveClip;
  void moveClipToLane;
  return (
    <div className="inspector-actions insp-actions-clean">
      <button className="btn tiny" onClick={() => duplicateClip(selectedClip.id)}>
        Duplicate
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

function WatermarkRemover({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    projectId,
    addEffect,
    updateEffect,
    removeEffect,
    setEffects,
    pushToast,
  } = panelCtx(ctx);
  const [busy, setBusy] = useState(false);
  if (!selectedClip) return null;
  const fx = (selectedClip.effects || []).find((e) => e.kind === "delogo");
  const labels = (fx?.boxes || []).map((b) => b.label).filter(Boolean) as string[];

  const applyBoxes = (
    boxes: { x: number; y: number; w: number; h: number; label?: string }[],
  ) => {
    const existing = (selectedClip.effects || []).find((e) => e.kind === "delogo");
    if (existing) {
      updateEffect(selectedClip.id, existing.id, {
        enabled: true,
        boxes,
        corner: undefined,
        amount: Math.max(existing.amount || 0, 70),
      });
      return;
    }
    if (setEffects) {
      const next = [
        ...(selectedClip.effects || []),
        {
          id: `fx-wm-${Date.now().toString(36)}`,
          kind: "delogo" as const,
          enabled: true,
          amount: 70,
          boxes,
        },
      ];
      setEffects(selectedClip.id, next);
      return;
    }
    addEffect(selectedClip.id, "delogo");
  };

  const runAiDetect = async () => {
    if (busy) return;
    setBusy(true);
    pushToast("Scanning clip for burned-in names…", "info");
    try {
      const res = await fetch("/api/ai/delogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          assetId: selectedClip.assetId,
          inPoint: selectedClip.inPoint,
          duration: Math.max(0.8, selectedClip.outPoint - selectedClip.inPoint),
          samples: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detect failed");
      const boxes = Array.isArray(data.boxes) ? data.boxes : [];
      if (!boxes.length) throw new Error(data.reason || "No marks found");
      applyBoxes(boxes);
      pushToast(data.reason || `Covered ${boxes.length} mark(s)`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Detect failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelBlock
      title="Remove watermark"
      hint="AI finds stable burned-in names (flux, ©, handles) across frames — or pick a corner manually."
      filterMatch={inspMatch(
        ctx.inspSearch || "",
        "watermark",
        "logo",
        "delogo",
        "tiktok",
        "instagram",
        "flux",
        "name",
        "copyright",
      )}
    >
      <button
        type="button"
        className="btn tiny wide insp-reset-btn"
        disabled={busy}
        onClick={() => void runAiDetect()}
      >
        {busy ? "Scanning…" : "AI remove names / logos"}
      </button>
      {labels.length > 0 && (
        <p className="tool-hint">Covering: {labels.slice(0, 5).join(" · ")}</p>
      )}
      {!fx ? (
        <button
          type="button"
          className="btn tiny wide"
          onClick={() => addEffect(selectedClip.id, "delogo")}
        >
          Or cover a corner
        </button>
      ) : (
        <>
          <div className="chip-row delogo-corners">
            {DELOGO_CORNERS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={
                  !fx.boxes?.length && (fx.corner || "br") === c.id ? "chip on" : "chip"
                }
                title={c.label}
                onClick={() =>
                  updateEffect(selectedClip.id, fx.id, {
                    corner: c.id,
                    boxes: undefined,
                    enabled: true,
                  })
                }
              >
                <span>{c.hint}</span>
              </button>
            ))}
          </div>
          <Slider
            label={`Cover pad · ${Math.round(fx.amount)}`}
            min={10}
            max={100}
            value={fx.amount}
            onChange={(v) => updateEffect(selectedClip.id, fx.id, { amount: v })}
          />
          <button
            type="button"
            className="btn tiny wide"
            onClick={() => removeEffect(selectedClip.id, fx.id)}
          >
            Clear watermark cover
          </button>
        </>
      )}
    </PanelBlock>
  );
}

/** Clip tab — layers + watermark remover. */
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
      <WatermarkRemover ctx={ctx} />
      <ClipLayersSection ctx={ctx} />
    </div>
  );
}
