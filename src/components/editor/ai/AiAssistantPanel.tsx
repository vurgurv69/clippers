"use client";

import { useState } from "react";
import type { AiSuggestion, ViralScorecard } from "@/lib/growth-types";
import { ViralScorecardView } from "@/components/editor/growth/ViralScorecard";

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
  onOpenTranscript?: () => void;
  onReframe?: () => void;
  onSearchSeek?: (query: string, mode?: "keyword" | "semantic") => void;
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
  onOpenTranscript,
  onReframe,
  onSearchSeek,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("semantic");

  const filtered =
    filter === "all"
      ? suggestions
      : suggestions.filter((s) => s.kind === filter);

  const kinds = Array.from(new Set(suggestions.map((s) => s.kind)));

  return (
    <div className="sidebar-panel cc-ai-panel">
      <h3 className="cc-lib-title">AI Assistant</h3>
      <p className="cc-lib-hint">
        Find hooks, silence, and viral moments on the timeline.
      </p>

      {onSearchSeek && (
        <div className="cc-search-row">
          <input
            className="cc-ai-filter"
            placeholder='Find in transcript…'
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
      )}
      {onSearchSeek && (
        <div className="cc-platform-row" style={{ marginBottom: "0.5rem" }}>
          <button
            type="button"
            className={searchMode === "semantic" ? "cc-hook-chip on" : "cc-hook-chip"}
            onClick={() => setSearchMode("semantic")}
          >
            Meaning
          </button>
          <button
            type="button"
            className={searchMode === "keyword" ? "cc-hook-chip on" : "cc-hook-chip"}
            onClick={() => setSearchMode("keyword")}
          >
            Keyword
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn wide primary cc-import"
        disabled={analyzing || duration < 0.5}
        onClick={onAnalyze}
        aria-label="Analyze timeline for viral moments"
      >
        {analyzing ? "Analyzing…" : "Analyze timeline"}
      </button>

      <div className="cc-ai-actions">
        {onOpenTranscript && (
          <button type="button" className="btn" onClick={onOpenTranscript}>
            Transcript
          </button>
        )}
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

      {!analyzing && suggestions.length === 0 && !score && (
        <div className="cc-growth-empty">
          <p className="cc-growth-empty-title">No AI insights yet</p>
          <p className="cc-lib-hint cc-ai-empty">
            Run analyze to place emoji markers and get a viral score.
          </p>
        </div>
      )}

      {analyzing && (
        <div className="cc-growth-skeleton" aria-busy="true" aria-label="Analyzing timeline">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cc-skeleton-line" style={{ width: `${65 + (i % 3) * 10}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}
