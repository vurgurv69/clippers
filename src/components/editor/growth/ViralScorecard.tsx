"use client";

import type { HookFixId, ViralScorecard } from "@/lib/growth-types";
import { HOOK_FIX_LABELS } from "@/lib/growth-types";

const BARS: { key: keyof ViralScorecard; label: string }[] = [
  { key: "virality", label: "Virality" },
  { key: "engagement", label: "Engagement" },
  { key: "pacing", label: "Pacing" },
  { key: "hook", label: "Hook" },
  { key: "subtitles", label: "Subtitles" },
  { key: "visual", label: "Visual" },
  { key: "retention", label: "Retention" },
];

type Props = {
  score: ViralScorecard;
  compact?: boolean;
  onHookFix?: (id: HookFixId) => void;
};

export function ViralScorecardView({ score, compact, onHookFix }: Props) {
  const curve = score.retentionCurve || [];

  return (
    <div className={compact ? "cc-scorecard compact" : "cc-scorecard"}>
      <div className="cc-score-hero">
        <span className="cc-score-num">{score.overall}</span>
        <div>
          <strong>Overall score</strong>
          <p>
            ~{score.estimatedRetentionPct}% est. retention
            {typeof score.estimatedCtrPct === "number"
              ? ` · ~${score.estimatedCtrPct}% CTR`
              : ""}
          </p>
        </div>
      </div>

      <div className="cc-score-bars">
        {BARS.map(({ key, label }) => {
          const v = score[key];
          if (typeof v !== "number") return null;
          return (
            <div key={key} className="cc-score-row">
              <span>{label}</span>
              <div className="cc-score-track">
                <i style={{ width: `${v}%` }} />
              </div>
              <em>{v}</em>
            </div>
          );
        })}
      </div>

      {!compact && curve.length > 1 && (
        <div className="cc-ret-curve" aria-label="Predicted retention curve">
          <strong>Predicted retention</strong>
          <svg viewBox="0 0 220 64" width="100%" height="64" role="img">
            <polyline
              fill="none"
              stroke="#12d6a0"
              strokeWidth="2.5"
              points={curve
                .map((p) => `${p.t * 210 + 5},${60 - (p.pct / 100) * 52}`)
                .join(" ")}
            />
            {curve.map((p, i) =>
              i % 2 === 0 ? (
                <circle
                  key={p.t}
                  cx={p.t * 210 + 5}
                  cy={60 - (p.pct / 100) * 52}
                  r="2.5"
                  fill="#12d6a0"
                />
              ) : null,
            )}
          </svg>
          <span className="cc-lib-hint">
            Start {curve[0]?.pct}% → end {curve[curve.length - 1]?.pct}%
          </span>
        </div>
      )}

      {!compact && (
        <>
          <p className="cc-score-platforms">
            Best: {score.bestPlatforms.join(" · ")}
          </p>
          <p className="cc-score-time">Post: {score.suggestedPostTime}</p>
          <ul className="cc-score-reasons">
            {score.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {score.improvements && score.improvements.length > 0 && (
            <ul className="cc-score-improvements">
              {score.improvements.map((r) => (
                <li key={r}>→ {r}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {score.hookWeak && onHookFix && score.hookFixes.length > 0 && (
        <div className="cc-hook-fixes">
          <strong>Weak hook — try:</strong>
          <div className="cc-hook-chips">
            {score.hookFixes.map((id) => (
              <button
                key={id}
                type="button"
                className="cc-hook-chip"
                onClick={() => onHookFix(id)}
              >
                {HOOK_FIX_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
