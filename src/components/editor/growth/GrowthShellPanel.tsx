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
  { id: "gradient", label: "Gradient plate", hint: "Soft color background" },
  { id: "flash", label: "Color flash", hint: "Quick accent wash" },
  { id: "lower", label: "Lower third", hint: "Wide bar graphic" },
  { id: "soft", label: "Soft wash", hint: "Dim overlay" },
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
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">Cutaways (B-roll)</h3>
        <p className="cc-help-lead">
          Extra clips that play over your main video — stock shots or graphics that keep the edit
          interesting while someone talks on camera.
        </p>
        <ol className="cc-help-steps">
          <li>Upload a photo/video, or pick a stock plate below.</li>
          <li>It lands on the overlay lane (V2) above your main clip.</li>
          <li>Trim it on the timeline so it covers the moment you want.</li>
        </ol>

        <label className="btn wide primary" style={{ display: "block", textAlign: "center" }}>
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
          className="btn wide"
          style={{ marginTop: "0.55rem" }}
          disabled={brollBusy}
          onClick={() => void onSuggestBroll?.()}
        >
          {brollBusy ? "Working…" : "Suggest cutaways for me"}
        </button>
        <p className="cc-lib-hint" style={{ marginTop: "0.35rem" }}>
          Finds a few quiet spots and drops simple stills there.
        </p>

        <h4 className="cc-lib-sub">Ready-made plates</h4>
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

        <h4 className="cc-lib-sub">Simple graphics</h4>
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
            <h4 className="cc-lib-sub">From your media</h4>
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
                      <span>Add as cutaway</span>
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
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">CTA (call to action)</h3>
        <p className="cc-help-lead">
          Short on-screen messages that ask viewers to do something — follow, comment, subscribe, or
          save. Best near the end of a clip.
        </p>
        <ol className="cc-help-steps">
          <li>Pick a CTA below — it adds text on the timeline.</li>
          <li>Move it to the last few seconds of your video.</li>
          <li>Edit the words in Inspector → Text if you want.</li>
        </ol>
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
      <div className="sidebar-panel cc-shell-panel cc-help-panel">
        <h3 className="cc-lib-title">Clean up</h3>
        <p className="cc-help-lead">
          Fix messy audio/video: cut dead silence and filler words, reduce noise, and steady shaky
          footage before you export.
        </p>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">1. Silence & filler</h4>
          <p className="cc-lib-hint">
            Run AI → Find viral moments first. Then trim dead air or “um / uh” from the main lane.
          </p>
          {!cleanupItems.length && (
            <p className="cc-help-empty">Nothing listed yet — analyze the video in AI & Cap.</p>
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
        </section>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">2. Noise reduction</h4>
          <p className="cc-lib-hint">Softer background hiss on export. Higher = stronger.</p>
          <label className="cc-help-slider">
            <span>Strength · {Math.round(denoiseLevel * 100)}%</span>
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
            <button type="button" className="btn wide" onClick={() => onDenoiseDialogue()}>
              Apply dialogue denoise
            </button>
          )}
        </section>

        <section className="cc-help-block">
          <h4 className="cc-lib-sub">3. Stabilize</h4>
          <p className="cc-lib-hint">Reduces handheld shake on main clips when you export.</p>
          <label className="cc-help-slider">
            <span>Strength · {Math.round(stabilizeLevel * 100)}%</span>
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
            <button type="button" className="btn wide" onClick={() => onStabilizeMain()}>
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
        Finish here when the edit is ready — open Growth Hub to export, write a caption, and schedule
        or upload (e.g. YouTube) from one place.
      </p>
      <ol className="cc-help-steps">
        <li>Export your video from the top bar or Growth Hub.</li>
        <li>Add title, description, and hashtags.</li>
        <li>Schedule or post when you’re happy with the cut.</li>
      </ol>
      <button type="button" className="btn primary wide" onClick={() => onOpenGrowthHub?.()}>
        Open Growth Hub
      </button>
    </div>
  );
}
