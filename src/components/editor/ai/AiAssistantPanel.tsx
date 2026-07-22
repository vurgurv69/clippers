"use client";

import { useState, type ReactNode } from "react";
import type { AiSuggestion, ViralScorecard } from "@/lib/growth-types";
import { ViralScorecardView } from "@/components/editor/growth/ViralScorecard";
import { CAPTION_SPEAKER_COLORS } from "@/lib/ai-edit-prompt";

type Props = {
  projectId: string;
  duration: number;
  videoTitle?: string;
  hasCaptions: boolean;
  hasMusic: boolean;
  clipCount: number;
  transcriptSnippet?: string;
  score: ViralScorecard | null;
  suggestions: AiSuggestion[];
  analyzing: boolean;
  onAnalyze: () => void;
  onApplySuggestion: (s: AiSuggestion) => void;
  onApplyMarkers: () => void;
  onHookFix: (id: string) => void;
  onOpenGrowthHub: () => void;
  onReframe?: () => void;
  onSearchSeek?: (query: string, mode?: "keyword" | "semantic") => void;
  /** Natural-language look / transform edit for the selected (or all) clips. */
  onApplyEditPrompt?: (prompt: string, scope: "selected" | "all") => void;
  /** Burn / rebuild captions from Whisper transcript. */
  onAutoCaptions?: () => void;
  /** Manual timed caption line. */
  onAddManualCaption?: (opts: {
    text: string;
    start: number;
    duration: number;
    speaker?: number;
    important?: boolean;
  }) => void;
  /** Captions / transcript section rendered below AI tools (same scroll). */
  captionsSlot?: ReactNode;
};

export function AiAssistantPanel({
  duration,
  score,
  suggestions,
  analyzing,
  onAnalyze,
  onApplySuggestion,
  onApplyMarkers,
  onHookFix,
  onOpenGrowthHub,
  onReframe,
  onSearchSeek,
  onApplyEditPrompt,
  onAutoCaptions,
  onAddManualCaption,
  captionsSlot,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("semantic");
  const [editPrompt, setEditPrompt] = useState("");
  const [editScope, setEditScope] = useState<"selected" | "all">("selected");
  const [capText, setCapText] = useState("");
  const [capStart, setCapStart] = useState(0);
  const [capDur, setCapDur] = useState(2.5);
  const [capSpeaker, setCapSpeaker] = useState(0);
  const [capImportant, setCapImportant] = useState(false);

  const filtered =
    filter === "all" ? suggestions : suggestions.filter((s) => s.kind === filter);
  const kinds = Array.from(new Set(suggestions.map((s) => s.kind)));

  return (
    <div className="sidebar-panel cc-ai-panel cc-ai-captions-scroll">
      <h3 className="cc-lib-title">AI & captions</h3>
      <p className="cc-lib-hint">
        Describe the look you want, burn subtitles, or scroll down for the full transcript tools.
      </p>

      {onApplyEditPrompt && (
        <div className="cc-ai-edit-box">
          <textarea
            className="cc-ai-edit-input"
            rows={3}
            placeholder='e.g. “make it warmer and brighter with a soft vignette”'
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
          />
          <div className="seg-row compact">
            <button
              type="button"
              className={editScope === "selected" ? "seg-btn on" : "seg-btn"}
              onClick={() => setEditScope("selected")}
            >
              Selected clip
            </button>
            <button
              type="button"
              className={editScope === "all" ? "seg-btn on" : "seg-btn"}
              onClick={() => setEditScope("all")}
            >
              All clips
            </button>
          </div>
          <button
            type="button"
            className="btn wide primary"
            disabled={!editPrompt.trim()}
            onClick={() => {
              onApplyEditPrompt(editPrompt.trim(), editScope);
              setEditPrompt("");
            }}
          >
            Apply edit
          </button>
        </div>
      )}

      <div className="cc-ai-block">
        <p className="tool-label">Subtitles</p>
        <p className="cc-lib-hint">
          Auto from speech, or type a line at a specific second. Speakers get different colors;
          important lines highlight gold.
        </p>
        {onAutoCaptions && (
          <button type="button" className="btn wide" onClick={onAutoCaptions}>
            Auto captions from speech
          </button>
        )}
        {onAddManualCaption && (
          <div className="cc-manual-cap">
            <input
              className="cc-ai-filter"
              placeholder="Subtitle text…"
              value={capText}
              onChange={(e) => setCapText(e.target.value)}
            />
            <div className="cc-manual-cap-row">
              <label>
                At (s)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={capStart}
                  onChange={(e) => setCapStart(Number(e.target.value))}
                />
              </label>
              <label>
                Length
                <input
                  type="number"
                  min={0.4}
                  step={0.1}
                  value={capDur}
                  onChange={(e) => setCapDur(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="seg-row compact wrap">
              {CAPTION_SPEAKER_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  className={capSpeaker === i ? "cap-swatch on" : "cap-swatch"}
                  style={{ background: c }}
                  title={`Speaker ${i + 1}`}
                  onClick={() => setCapSpeaker(i)}
                />
              ))}
              <button
                type="button"
                className={capImportant ? "seg-btn on" : "seg-btn"}
                onClick={() => setCapImportant((v) => !v)}
              >
                Important
              </button>
            </div>
            <button
              type="button"
              className="btn tiny wide"
              disabled={!capText.trim()}
              onClick={() => {
                onAddManualCaption({
                  text: capText.trim(),
                  start: Math.max(0, capStart),
                  duration: Math.max(0.4, capDur),
                  speaker: capSpeaker,
                  important: capImportant,
                });
                setCapText("");
              }}
            >
              Add subtitle at {capStart.toFixed(1)}s
            </button>
          </div>
        )}
      </div>

      {onSearchSeek && (
        <>
          <p className="tool-label">Find in speech</p>
          <div className="cc-search-row">
            <input
              className="cc-ai-filter"
              placeholder="Find in transcript…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) onSearchSeek(q.trim(), searchMode);
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => q.trim() && onSearchSeek(q.trim(), searchMode)}
            >
              Go
            </button>
          </div>
          <div className="seg-row compact" style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              className={searchMode === "semantic" ? "seg-btn on" : "seg-btn"}
              onClick={() => setSearchMode("semantic")}
            >
              Meaning
            </button>
            <button
              type="button"
              className={searchMode === "keyword" ? "seg-btn on" : "seg-btn"}
              onClick={() => setSearchMode("keyword")}
            >
              Keyword
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        className="btn wide"
        disabled={analyzing || duration < 0.5}
        onClick={onAnalyze}
      >
        {analyzing ? "Analyzing…" : "Find viral moments"}
      </button>

      <div className="cc-ai-actions">
        {onReframe && (
          <button type="button" className="btn" onClick={onReframe}>
            AI Reframe
          </button>
        )}
      </div>

      {score && (
        <div className="cc-ai-score-wrap">
          <ViralScorecardView score={score} compact onHookFix={onHookFix} />
          <button type="button" className="btn wide" onClick={onOpenGrowthHub}>
            Open Growth Hub
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="cc-ai-actions">
            <button type="button" className="btn" onClick={onApplyMarkers}>
              Drop all markers
            </button>
            <select
              className="cc-ai-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter suggestions"
            >
              <option value="all">All ({suggestions.length})</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <ul className="cc-ai-list">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="cc-ai-item"
                  onClick={() => onApplySuggestion(s)}
                  title={s.reason}
                >
                  <span className="cc-ai-emoji">{s.emoji}</span>
                  <span className="cc-ai-meta">
                    <strong>{s.label.replace(/^[^\s]+\s/, "")}</strong>
                    <span>
                      {s.start.toFixed(1)}s – {s.end.toFixed(1)}s · {s.score}
                    </span>
                    <em>{s.reason}</em>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {captionsSlot && (
        <div className="cc-ai-captions-embed">
          <div className="cc-ai-captions-divider" aria-hidden />
          {captionsSlot}
        </div>
      )}
    </div>
  );
}
