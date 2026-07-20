"use client";

import { BROLL_CARDS, MOTION_CTA_CARDS, type ShellCard } from "@/lib/capcut-catalog";
import type { ProjectAsset } from "@/lib/editor-types";

type CleanupItem = {
  id: string;
  start: number;
  end: number;
  label: string;
  kind: "silence" | "filler";
};

const BROLL_PRESETS = [
  { id: "gradient", label: "Gradient plate", hint: "Generate still → V2" },
  { id: "flash", label: "Color flash", hint: "Accent wash → V2" },
  { id: "lower", label: "Lower third", hint: "Wide bar → V2" },
  { id: "soft", label: "Soft wash", hint: "Dim overlay → V2" },
] as const;

const STOCK_BROLL = [
  { id: "stock-nature", label: "Nature", hint: "Green plate" },
  { id: "stock-city", label: "City", hint: "Urban slate" },
  { id: "stock-tech", label: "Tech", hint: "Teal plate" },
  { id: "stock-warm", label: "Warm light", hint: "Amber wash" },
  { id: "stock-abstract", label: "Abstract", hint: "Texture" },
  { id: "stock-office", label: "Office", hint: "Neutral gray" },
] as const;

type Props = {
  mode: "broll" | "cleanup" | "motion" | "publish";
  cleanupItems?: CleanupItem[];
  mediaAssets?: ProjectAsset[];
  onInsertShell?: (card: ShellCard) => void;
  onApplyCleanup?: (item: CleanupItem) => void;
  onApplyCleanupAll?: () => void;
  onSeek?: (t: number) => void;
  onOpenGrowthHub?: () => void;
  onInsertMediaOverlay?: (asset: ProjectAsset) => void;
  denoiseLevel?: number;
  onDenoiseChange?: (level: number) => void;
  onDenoiseDialogue?: () => void;
  stabilizeLevel?: number;
  onStabilizeChange?: (level: number) => void;
  onStabilizeMain?: () => void;
  onGenerateBroll?: (preset: string) => void | Promise<void>;
  onUploadBroll?: (file: File) => void | Promise<void>;
  onSuggestBroll?: () => void | Promise<void>;
  brollBusy?: boolean;
};

export function GrowthShellPanel({
  mode,
  cleanupItems = [],
  mediaAssets = [],
  onInsertShell,
  onApplyCleanup,
  onApplyCleanupAll,
  onSeek,
  onOpenGrowthHub,
  onInsertMediaOverlay,
  onGenerateBroll,
  onUploadBroll,
  onSuggestBroll,
  brollBusy,
  denoiseLevel = 0,
  onDenoiseChange,
  onDenoiseDialogue,
  stabilizeLevel = 0,
  onStabilizeChange,
  onStabilizeMain,
}: Props) {
  if (mode === "broll") {
    const media = mediaAssets.filter((a) => a.kind === "video" || a.kind === "image");
    return (
      <div className="sidebar-panel cc-shell-panel">
        <h3 className="cc-lib-title">B-roll</h3>
        <p className="cc-lib-hint">
          Drop real media on V2, pull a stock plate, generate a still, or insert a text accent.
        </p>

        <label className="btn wide" style={{ display: "block", textAlign: "center" }}>
          {brollBusy ? "Working…" : "Upload media → V2"}
          <input
            type="file"
            accept="video/*,image/*"
            hidden
            disabled={brollBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadBroll?.(f);
              e.target.value = "";
            }}
          />
        </label>

        <button
          type="button"
          className="btn primary wide"
          style={{ marginTop: "0.55rem" }}
          disabled={brollBusy}
          onClick={() => void onSuggestBroll?.()}
        >
          {brollBusy ? "Working…" : "AI suggest B-roll"}
        </button>
        <p className="cc-lib-hint" style={{ marginTop: "0.35rem" }}>
          Finds up to 3 moments, generates stills, and places them on V2.
        </p>

        <h4 className="cc-lib-sub">Stock library</h4>
        <p className="cc-lib-hint">Local plates (no external CDN). Tagged stock + broll.</p>
        <div className="cc-shell-grid">
          {STOCK_BROLL.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cc-shell-card"
              disabled={brollBusy}
              onClick={() => void onGenerateBroll?.(p.id)}
            >
              <span>▣</span>
              <strong>{p.label}</strong>
              <em>{p.hint}</em>
            </button>
          ))}
        </div>

        <h4 className="cc-lib-sub">Generate stills</h4>
        <div className="cc-shell-grid">
          {BROLL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cc-shell-card"
              disabled={brollBusy}
              onClick={() => void onGenerateBroll?.(p.id)}
            >
              <span>▣</span>
              <strong>{p.label}</strong>
              <em>{p.hint}</em>
            </button>
          ))}
        </div>

        {media.length > 0 && (
          <>
            <h4 className="cc-lib-sub">From media bin</h4>
            <ul className="cc-ai-list">
              {media.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="cc-ai-item"
                    onClick={() => onInsertMediaOverlay?.(a)}
                  >
                    <span className="cc-ai-emoji">{a.kind === "image" ? "🖼" : "🎬"}</span>
                    <span className="cc-ai-meta">
                      <strong>{a.name.slice(0, 28)}</strong>
                      <span>{a.kind} · Insert on V2</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="cc-lib-sub">Text accents</h4>
        <div className="cc-shell-grid">
          {BROLL_CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cc-shell-card"
              onClick={() => onInsertShell?.(c)}
            >
              <span>{c.preview}</span>
              <strong>{c.label}</strong>
              <em>{c.hint}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "motion") {
    return (
      <div className="sidebar-panel cc-shell-panel">
        <h3 className="cc-lib-title">Motion / CTA</h3>
        <p className="cc-lib-hint">One-tap CTA text presets for endings.</p>
        <div className="cc-shell-grid">
          {MOTION_CTA_CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cc-shell-card"
              onClick={() => onInsertShell?.(c)}
            >
              <span>{c.preview}</span>
              <strong>{c.label}</strong>
              <em>{c.hint}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "cleanup") {
    return (
      <div className="sidebar-panel cc-shell-panel">
        <h3 className="cc-lib-title">Auto Cleanup</h3>
        <p className="cc-lib-hint">
          Silence & filler from Analyze. Trim removes the range from the main lane.
        </p>
        <div className="cc-cleanup-denoise" style={{ marginBottom: "0.75rem" }}>
          <label className="cc-lib-hint">
            Denoise (export)
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={denoiseLevel}
              onChange={(e) => onDenoiseChange?.(Number(e.target.value))}
              style={{ width: "100%", marginTop: "0.35rem" }}
            />
            <span>{Math.round(denoiseLevel * 100)}%</span>
          </label>
          {onDenoiseDialogue && (
            <button
              type="button"
              className="btn wide"
              style={{ marginTop: "0.45rem" }}
              onClick={() => onDenoiseDialogue()}
            >
              Denoise dialogue
            </button>
          )}
        </div>
        <div className="cc-cleanup-stabilize" style={{ marginBottom: "0.75rem" }}>
          <label className="cc-lib-hint">
            Stabilize / shake fix (export)
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={stabilizeLevel}
              onChange={(e) => onStabilizeChange?.(Number(e.target.value))}
              style={{ width: "100%", marginTop: "0.35rem" }}
            />
            <span>{Math.round(stabilizeLevel * 100)}%</span>
          </label>
          {onStabilizeMain && (
            <button
              type="button"
              className="btn wide"
              style={{ marginTop: "0.45rem" }}
              onClick={() => onStabilizeMain()}
            >
              Stabilize main clips
            </button>
          )}
          <p className="cc-lib-hint" style={{ marginTop: "0.35rem" }}>
            Applies FFmpeg deshake on export (mild crop to hide edges).
          </p>
        </div>
        {!cleanupItems.length && (
          <p className="cc-lib-hint">Run AI → Analyze to populate cleanup tips.</p>
        )}
        {cleanupItems.length > 1 && (
          <button
            type="button"
            className="btn primary wide"
            style={{ marginBottom: "0.55rem" }}
            onClick={() => onApplyCleanupAll?.()}
          >
            Trim all ({cleanupItems.length})
          </button>
        )}
        <ul className="cc-ai-list">
          {cleanupItems.map((item) => (
            <li key={item.id}>
              <div className="cc-ai-item cc-cleanup-row">
                <button
                  type="button"
                  className="cc-ai-item-main"
                  onClick={() => onSeek?.(item.start)}
                >
                  <span className="cc-ai-emoji">
                    {item.kind === "silence" ? "🤫" : "✂️"}
                  </span>
                  <span className="cc-ai-meta">
                    <strong>{item.label}</strong>
                    <span>
                      {item.start.toFixed(1)}s – {item.end.toFixed(1)}s
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="cc-hook-chip on"
                  onClick={() => onApplyCleanup?.(item)}
                >
                  Trim
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="sidebar-panel cc-shell-panel">
      <h3 className="cc-lib-title">Publish</h3>
      <p className="cc-lib-hint">
        Connect YouTube and schedule posts from the Growth Hub after export.
      </p>
      <button type="button" className="btn primary wide" onClick={() => onOpenGrowthHub?.()}>
        Open Growth Hub
      </button>
    </div>
  );
}
