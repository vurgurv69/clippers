"use client";

/** Mini animated preview boxes for transitions & effects (CapCut-style cards). */

export function TransitionPreview({ kind }: { kind: string }) {
  const k = kind.replace(/[^a-z0-9]/gi, "") || "crossfade";
  return (
    <span className={`cc-fx-box cc-tr cc-tr-${k}`} aria-hidden>
      <span className="cc-fx-panel a">A</span>
      <span className="cc-fx-panel b">B</span>
      <span className="cc-fx-flash" />
    </span>
  );
}

export function EffectPreview({ kind }: { kind: string }) {
  const k = kind.replace(/[^a-z0-9]/gi, "") || "blur";
  return (
    <span className={`cc-fx-box cc-ef cc-fx-${k}`} aria-hidden>
      <span className="cc-fx-scene">
        <span className="cc-fx-hill" />
        <span className="cc-fx-sun" />
      </span>
    </span>
  );
}

export function FilterPreview({ swatch }: { swatch: string }) {
  return (
    <span className="cc-fx-box cc-filter" aria-hidden style={{ background: swatch }}>
      <span className="cc-fx-scene muted">
        <span className="cc-fx-hill" />
        <span className="cc-fx-sun" />
      </span>
    </span>
  );
}

export function TextPreview({
  text,
  accent,
}: {
  text: string;
  accent: string;
}) {
  return (
    <span
      className="cc-fx-box cc-text-prev"
      aria-hidden
      style={{ background: `linear-gradient(160deg, ${accent}33, #0c0e12)` }}
    >
      <span className="cc-text-sample" style={{ color: accent }}>
        {text}
      </span>
    </span>
  );
}
