"use client";

/** Photo pair used in transition / effect card previews (Unsplash). */
const PHOTO_A =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=320&h=200&fit=crop&q=60";
const PHOTO_B =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=320&h=200&fit=crop&q=60";

/** Sanitize kind → CSS class suffix. */
function cssKind(kind: string): string {
  return kind.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "crossfade";
}

/** Map effect kinds → overlay CSS class. */
function fxFamily(kind: string): string {
  const k = kind.replace(/[^a-z0-9]/gi, "").toLowerCase() || "blur";
  if (/blur|motionblur|pixelate/.test(k)) return "blur";
  if (/glow|bloom|sharpen/.test(k)) return "glow";
  if (/vignette|shadow/.test(k)) return "vignette";
  if (/grain|noise/.test(k)) return "grain";
  if (/mirror|flip/.test(k)) return "mirror";
  if (/shake|wave/.test(k)) return "shake";
  if (/glitch|rgbsplit|hue/.test(k)) return "glow";
  return k;
}

/**
 * Mini animated preview — one CSS motion per transition id
 * (classic NLE / open-source looks: fade, wipe, clock, cube, glitch…).
 */
export function TransitionPreview({ kind }: { kind: string }) {
  const k = cssKind(kind);
  return (
    <span className={`cc-fx-box cc-tr cc-tr-photo cc-trk-${k}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cc-fx-photo a" src={PHOTO_A} alt="" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cc-fx-photo b" src={PHOTO_B} alt="" draggable={false} />
      <span className="cc-fx-flash" />
      <span className="cc-fx-label">{kind}</span>
    </span>
  );
}

/** Effect preview on a photo so the look is obvious. */
export function EffectPreview({ kind }: { kind: string }) {
  const family = fxFamily(kind);
  return (
    <span className={`cc-fx-box cc-ef cc-ef-photo cc-fx-${family}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cc-fx-photo full" src={PHOTO_A} alt="" draggable={false} />
      <span className={`cc-fx-overlay cc-fx-${family}`} />
    </span>
  );
}

export function FilterPreview({ swatch }: { swatch: string }) {
  return (
    <span className="cc-fx-box cc-filter" aria-hidden style={{ background: swatch }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="cc-fx-photo full"
        src={PHOTO_B}
        alt=""
        draggable={false}
        style={{ opacity: 0.55 }}
      />
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
