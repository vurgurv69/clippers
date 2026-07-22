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

const STOCK_BROLL = [
  { id: "stock-nature", label: "Nature" },
  { id: "stock-city", label: "City" },
  { id: "stock-tech", label: "Tech" },
  { id: "stock-warm", label: "Warm" },
  { id: "stock-abstract", label: "Abstract" },
  { id: "stock-office", label: "Office" },
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
    const media = mediaAssets.filter((a) => a.kind === "video" || a.kind === "image").slice(0, 8);
    return (
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">Cutaways</h3>
        <p className="cc-help-lead">
          Overlay clips on top of your main video while someone talks — photos, stock plates, or
          short cutaways.
        </p>

        <div className="cc-action-stack">
          <label className="cc-action-btn primary">
            {brollBusy ? "Working…" : "Upload cutaway"}
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
            className="cc-action-btn"
            disabled={brollBusy}
            onClick={() => void onSuggestBroll?.()}
          >
            {brollBusy ? "Working…" : "Suggest for me"}
          </button>
        </div>

        <h4 className="cc-lib-sub">Stock plates</h4>
        <div className="cc-shell-grid clean">
          {STOCK_BROLL.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cc-shell-card clean"
              disabled={brollBusy}
              onClick={() => void onGenerateBroll?.(p.id)}
            >
              <strong>{p.label}</strong>
            </button>
          ))}
        </div>

        {media.length > 0 && (
          <>
            <h4 className="cc-lib-sub">From media</h4>
            <div className="cc-action-stack">
              {media.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="cc-action-btn"
                  onClick={() => onInsertMediaOverlay?.(a)}
                >
                  {a.name.slice(0, 28)}
                </button>
              ))}
            </div>
          </>
        )}

        <h4 className="cc-lib-sub">Text accents</h4>
        <div className="cc-action-stack">
          {BROLL_CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cc-action-btn grow"
              onClick={() => onInsertShell?.(c)}
            >
              {c.label}
              <span>{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "motion") {
    return (
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">Call to action</h3>
        <p className="cc-help-lead">
          End-screen text like Follow, Comment, or Subscribe. Place it in the last few seconds.
        </p>
        <div className="cc-action-stack">
          {MOTION_CTA_CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cc-action-btn grow"
              onClick={() => onInsertShell?.(c)}
            >
              {c.label}
              <span>{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "cleanup") {
    return (
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">Cleanup</h3>
        <p className="cc-help-lead">
          Trim silence, cut filler words, reduce noise, and steady shaky clips before export.
        </p>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">Silence & filler</h4>
          {!cleanupItems.length ? (
            <p className="cc-help-empty">Run AI → Find viral moments to list cleanup spots.</p>
          ) : (
            <>
              {cleanupItems.length > 1 && (
                <button
                  type="button"
                  className="cc-action-btn primary"
                  onClick={() => onApplyCleanupAll?.()}
                >
                  Trim all ({cleanupItems.length})
                </button>
              )}
              <div className="cc-action-stack tight">
                {cleanupItems.map((item) => (
                  <div key={item.id} className="cc-cleanup-line">
                    <button type="button" className="cc-action-btn grow" onClick={() => onSeek?.(item.start)}>
                      {item.label}
                      <span>
                        {item.start.toFixed(1)}–{item.end.toFixed(1)}s
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cc-action-btn compact"
                      onClick={() => onApplyCleanup?.(item)}
                    >
                      Trim
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">Noise</h4>
          <label className="cc-help-slider">
            <span>{Math.round(denoiseLevel * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={denoiseLevel}
              onChange={(e) => onDenoiseChange?.(Number(e.target.value))}
            />
          </label>
          {onDenoiseDialogue && (
            <button type="button" className="cc-action-btn" onClick={() => onDenoiseDialogue()}>
              Apply denoise
            </button>
          )}
        </section>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">Stabilize</h4>
          <label className="cc-help-slider">
            <span>{Math.round(stabilizeLevel * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={stabilizeLevel}
              onChange={(e) => onStabilizeChange?.(Number(e.target.value))}
            />
          </label>
          {onStabilizeMain && (
            <button type="button" className="cc-action-btn" onClick={() => onStabilizeMain()}>
              Stabilize main clips
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="sidebar-panel cc-shell-panel cc-help-panel">
      <h3 className="cc-lib-title">Publish</h3>
      <p className="cc-help-lead">
        When the cut looks good, open Growth Hub to export, write a caption, and schedule or upload.
      </p>
      <div className="cc-action-stack">
        <button type="button" className="cc-action-btn primary" onClick={() => onOpenGrowthHub?.()}>
          Open Growth Hub
        </button>
      </div>
    </div>
  );
}
