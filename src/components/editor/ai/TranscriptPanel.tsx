"use client";

import { useEffect, useMemo, useState } from "react";
import type { TranscriptSegment, TranscriptWord } from "@/lib/types";
import { activeSegmentIndex, searchTranscript, type TranscriptHit } from "@/lib/transcript-search";

type Props = {
  projectId: string;
  assetId?: string | null;
  current: number;
  onSeek: (t: number) => void;
  onRippleTrim?: (start: number, end: number) => void;
  onReframe?: () => void;
  onExportThumb?: (headline?: string) => void;
  onShare?: () => void;
  /** Burn transcript segments as caption text overlays (Phase 29). */
  onBurnCaptions?: (segments: TranscriptSegment[]) => void;
  /** Manual timed subtitle when speech-to-text isn't enough. */
  onAddManualCaption?: (opts: {
    text: string;
    start: number;
    duration: number;
    speaker?: number;
    important?: boolean;
  }) => void;
  /** Nested under AI & Captions — skip the big page title. */
  embedded?: boolean;
};

type PendingCut = {
  key: string;
  start: number;
  end: number;
  label: string;
};

export function TranscriptPanel({
  projectId,
  assetId,
  current,
  onSeek,
  onRippleTrim,
  onReframe,
  onExportThumb,
  onShare,
  onBurnCaptions,
  onAddManualCaption,
  embedded,
}: Props) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("semantic");
  const [searchHint, setSearchHint] = useState("");
  const [hits, setHits] = useState<TranscriptHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [pendingCut, setPendingCut] = useState<PendingCut | null>(null);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualAt, setManualAt] = useState(0);

  const activeIdx = useMemo(
    () => activeSegmentIndex(segments, current),
    [segments, current],
  );

  const hasWordTiming = useMemo(
    () => segments.some((s) => (s.words?.length ?? 0) > 0),
    [segments],
  );

  async function loadCached() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ projectId });
      if (assetId) q.set("assetId", assetId);
      const res = await fetch(`/api/ai/transcript?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setSegments(data.segments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function runTranscribe() {
    setTranscribing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assetId: assetId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcribe failed");
      setSegments(data.segments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcribe failed");
    } finally {
      setTranscribing(false);
    }
  }

  useEffect(() => {
    void loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetId]);

  useEffect(() => {
    if (!pendingCut) return;
    const t = window.setTimeout(() => setPendingCut(null), 4000);
    return () => window.clearTimeout(t);
  }, [pendingCut]);

  function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setHits(searchTranscript(segments, q));
  }

  async function runServerSearch() {
    if (!query.trim()) return;
    setSearchHint("");
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          assetId: assetId || undefined,
          query,
          mode: searchMode,
          segments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setHits(data.hits || []);
      if (data.hits?.[0]) onSeek(data.hits[0].start);
      if (data.mode === "semantic") {
        setSearchHint(
          data.usedLlm ? "Semantic match (LLM)" : "Semantic match (synonyms)",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function requestCut(key: string, start: number, end: number, label: string) {
    if (!onRippleTrim) return;
    if (pendingCut?.key === key) {
      onRippleTrim(start, end);
      setPendingCut(null);
      setSelected(null);
      return;
    }
    setPendingCut({ key, start, end, label });
  }

  function cutSegment(seg: TranscriptSegment, segIdx: number) {
    requestCut(`seg-${segIdx}`, seg.start, seg.end, "Cut segment");
  }

  function cutWord(word: TranscriptWord, segIdx: number, wordIdx: number) {
    requestCut(`w-${segIdx}-${wordIdx}`, word.start, word.end, "Cut word range");
  }

  return (
    <div className={embedded ? "cc-transcript-panel embedded" : "sidebar-panel cc-transcript-panel"}>
      <h3 className="cc-lib-title">{embedded ? "Transcript tools" : "Captions & script"}</h3>
      <p className="cc-lib-hint">
        {embedded
          ? "Transcribe, search speech, burn captions, or type a line at any second."
          : "Transcribe speech into timed captions, edit a talking-points script, or type a line at any second. Speakers get different colors when you burn captions."}
      </p>

      <div className="cc-ai-block">
        <p className="tool-label">Script notes</p>
        <textarea
          className="cc-ai-edit-input"
          rows={4}
          placeholder="Outline what should be said on camera… (stays here as your edit checklist)"
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
        />
        <p className="cc-lib-hint">
          Use this as your shot list / talking points while you cut. It doesn’t change the video —
          captions below do.
        </p>
      </div>

      {onAddManualCaption && (
        <div className="cc-manual-cap">
          <p className="tool-label">Type a subtitle</p>
          <input
            className="cc-ai-filter"
            placeholder="What they said…"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
          <div className="cc-manual-cap-row">
            <label>
              At (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={manualAt}
                onChange={(e) => setManualAt(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn tiny"
              onClick={() => setManualAt(Math.round(current * 10) / 10)}
            >
              Use playhead
            </button>
          </div>
          <button
            type="button"
            className="btn tiny wide"
            disabled={!manualText.trim()}
            onClick={() => {
              onAddManualCaption({
                text: manualText.trim(),
                start: Math.max(0, manualAt),
                duration: 2.5,
              });
              setManualText("");
            }}
          >
            Add subtitle
          </button>
        </div>
      )}

      <div className="cc-ai-actions">
        <button
          type="button"
          className="btn"
          disabled={loading || transcribing}
          onClick={() => void loadCached()}
          aria-label="Refresh transcript"
        >
          Refresh
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={transcribing}
          onClick={() => void runTranscribe()}
          aria-label="Transcribe video"
        >
          {transcribing ? "Transcribing…" : "Transcribe"}
        </button>
      </div>

      <div className="cc-search-row">
        <input
          className="cc-ai-filter"
          placeholder='Search — e.g. "pricing"'
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runServerSearch();
          }}
          aria-label="Search transcript"
        />
        <button
          type="button"
          className="btn"
          onClick={() => void runServerSearch()}
          aria-label="Find in transcript"
        >
          Find
        </button>
      </div>
      <div className="cc-platform-row" style={{ marginBottom: "0.45rem" }}>
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
      {searchHint && <p className="cc-lib-hint">{searchHint}</p>}

      {hits.length > 0 && (
        <ul className="cc-ai-list cc-search-hits">
          {hits.map((h, i) => (
            <li key={`${h.start}-${i}`}>
              <button
                type="button"
                className="cc-ai-item"
                onClick={() => onSeek(h.start)}
              >
                <span className="cc-ai-emoji">🔎</span>
                <span className="cc-ai-meta">
                  <strong>{h.start.toFixed(1)}s</strong>
                  <em>{h.text}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="cc-lib-hint">{error}</p>}

      <div className="cc-transcript-tools">
        {onBurnCaptions && segments.length > 0 && (
          <button
            type="button"
            className="btn primary"
            onClick={() => onBurnCaptions(segments)}
            aria-label="Burn transcript as captions on timeline"
          >
            Burn captions
          </button>
        )}
        {onReframe && (
          <button type="button" className="btn" onClick={onReframe}>
            AI Reframe
          </button>
        )}
        {onExportThumb && (
          <button
            type="button"
            className="btn"
            onClick={() => onExportThumb(hits[0]?.text?.slice(0, 40))}
          >
            Export thumb
          </button>
        )}
        {onShare && (
          <button type="button" className="btn" onClick={onShare}>
            Share review
          </button>
        )}
      </div>

      {pendingCut && onRippleTrim && (
        <div className="cc-transcript-confirm" role="status">
          <span>
            {pendingCut.label} {pendingCut.start.toFixed(1)}s–{pendingCut.end.toFixed(1)}s?
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onRippleTrim(pendingCut.start, pendingCut.end);
              setPendingCut(null);
              setSelected(null);
            }}
          >
            Confirm cut
          </button>
          <button type="button" className="btn" onClick={() => setPendingCut(null)}>
            Cancel
          </button>
        </div>
      )}

      {selected && onRippleTrim && !pendingCut && (
        <button
          type="button"
          className="btn wide"
          onClick={() =>
            requestCut("range", selected.start, selected.end, "Cut segment")
          }
        >
          Cut segment {selected.start.toFixed(1)}s–{selected.end.toFixed(1)}s
        </button>
      )}

      <div className="cc-transcript-body">
        {loading && (
          <div className="cc-growth-skeleton" aria-busy="true" aria-label="Loading transcript">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cc-skeleton-line" style={{ width: `${55 + (i % 3) * 15}%` }} />
            ))}
          </div>
        )}
        {!segments.length && !loading && (
          <div className="cc-growth-empty">
            <p className="cc-growth-empty-title">No transcript yet</p>
            <p className="cc-lib-hint">Transcribe to search and cut segments.</p>
            <button
              type="button"
              className="btn primary"
              disabled={transcribing}
              onClick={() => void runTranscribe()}
            >
              {transcribing ? "Transcribing…" : "Transcribe"}
            </button>
          </div>
        )}
        {segments.map((s, i) => {
          const words = s.words?.length ? s.words : null;
          const isExpanded = expandedSeg === i;
          return (
            <div key={`${s.start}-${i}`} className="cc-transcript-row">
              <button
                type="button"
                className={
                  i === activeIdx
                    ? "cc-transcript-seg on"
                    : selected &&
                        s.start >= selected.start - 0.01 &&
                        s.end <= selected.end + 0.01
                      ? "cc-transcript-seg sel"
                      : "cc-transcript-seg"
                }
                onClick={() => {
                  onSeek(s.start);
                  setSelected({ start: s.start, end: s.end });
                }}
                onDoubleClick={() => {
                  if (i < segments.length - 1) {
                    setSelected({ start: s.start, end: segments[i + 1].end });
                  }
                }}
                title={`${s.start.toFixed(1)}–${s.end.toFixed(1)}s`}
              >
                {s.text}
              </button>
              {onRippleTrim && (
                <button
                  type="button"
                  className={
                    pendingCut?.key === `seg-${i}`
                      ? "cc-transcript-cut confirm"
                      : "cc-transcript-cut"
                  }
                  aria-label={`Cut segment ${s.start.toFixed(1)} to ${s.end.toFixed(1)} seconds`}
                  title="Cut segment — removes this range from the timeline"
                  onClick={(e) => {
                    e.stopPropagation();
                    cutSegment(s, i);
                  }}
                >
                  {pendingCut?.key === `seg-${i}` ? "Confirm?" : "Cut segment"}
                </button>
              )}
              {words && words.length > 1 && (
                <button
                  type="button"
                  className="cc-transcript-expand"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Hide words" : "Show words"}
                  onClick={() => setExpandedSeg(isExpanded ? null : i)}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              )}
              {words && isExpanded && (
                <div className="cc-transcript-words">
                  {words.map((w, wi) => (
                    <span key={`${w.start}-${wi}`} className="cc-transcript-word-wrap">
                      <button
                        type="button"
                        className="cc-transcript-word"
                        onClick={() => onSeek(w.start)}
                        title={`${w.start.toFixed(1)}–${w.end.toFixed(1)}s`}
                      >
                        {w.word}
                      </button>
                      {onRippleTrim && (
                        <button
                          type="button"
                          className={
                            pendingCut?.key === `w-${i}-${wi}`
                              ? "cc-transcript-cut word confirm"
                              : "cc-transcript-cut word"
                          }
                          aria-label={`Cut word ${w.word}`}
                          title="Cut word range from timeline"
                          onClick={() => cutWord(w, i, wi)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
