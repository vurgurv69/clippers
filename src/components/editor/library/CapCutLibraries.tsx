"use client";

import {
  ANIM_CARDS,
  ANIM_CATEGORIES,
  EFFECT_CARDS,
  EFFECT_CATEGORIES,
  FILTER_CARDS,
  FILTER_CATEGORIES,
  TEXT_CARDS,
  TEXT_CATEGORIES,
  TRANSITION_CARDS,
  TRANSITION_CATEGORIES,
} from "@/lib/capcut-catalog";
import { STICKER_PACK, STICKER_PRESETS } from "@/lib/editor-types";
import type { ColorGrade, EffectKind, TextOverlay, TransitionKind } from "@/lib/editor-types";
import { CapCutCard, CapCutLibraryShell } from "@/components/editor/library/CapCutLibraryShell";
import {
  EffectPreview,
  FilterPreview,
  TextPreview,
  TransitionPreview,
} from "@/components/editor/library/FxPreviewBox";

export { TemplateLibrary } from "@/components/editor/library/TemplateLibrary";

function matches(q: string, ...parts: string[]) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return parts.some((p) => p.toLowerCase().includes(s));
}

const TR_CATS = [{ id: "all", label: "All" }, ...TRANSITION_CATEGORIES];

export function TextLibrary({
  onInsert,
}: {
  onInsert: (style: Partial<TextOverlay>, label: string) => void;
}) {
  return (
    <CapCutLibraryShell title="Text" categories={TEXT_CATEGORIES} searchPlaceholder="Search text…">
      {({ category, query }) => {
        const list = TEXT_CARDS.filter((c) => {
          if (!matches(query, c.label, c.category)) return false;
          if (category === "templates") return c.category === "templates" || c.id.startsWith("tpl-");
          if (category === "basic") return c.category === "basic";
          return c.category === category;
        });
        return (
          <div className="cc-grid">
            {list.map((c) => (
              <CapCutCard
                key={c.id}
                label={c.label}
                preview={<TextPreview text={c.preview} accent={c.accent} />}
                onClick={() => onInsert(c.style, c.label)}
              />
            ))}
            {list.length === 0 && <p className="cc-empty">No text styles match</p>}
          </div>
        );
      }}
    </CapCutLibraryShell>
  );
}

export function TransitionLibrary({
  selected,
  favorites,
  duration,
  onDuration,
  onApply,
  onPreview,
  onToggleFav,
}: {
  selected?: TransitionKind;
  favorites: TransitionKind[];
  duration: number;
  onDuration: (d: number) => void;
  onApply: (id: TransitionKind) => void;
  onPreview?: (id: TransitionKind) => void;
  onToggleFav: (id: TransitionKind) => void;
}) {
  return (
    <CapCutLibraryShell
      title="Transitions"
      categories={TR_CATS}
      searchPlaceholder="Search transitions…"
      footer={
        <div className="cc-duration">
          <label>
            <span>Duration</span>
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={duration}
              onChange={(e) => onDuration(Number(e.target.value))}
            />
            <em>{duration.toFixed(2)}s</em>
          </label>
        </div>
      }
    >
      {({ category, query }) => {
        const list = TRANSITION_CARDS.filter((c) => {
          if (c.id === "none") return false;
          if (!matches(query, c.label, c.category)) return false;
          if (category === "all") return true;
          if (category === "favorites") return favorites.includes(c.id);
          return c.category === category;
        });
        return (
          <div className="cc-grid cc-grid-3">
            {list.map((c) => (
              <div key={c.id} className="cc-card-wrap">
                <CapCutCard
                  label={c.label}
                  active={selected === c.id}
                  preview={<TransitionPreview kind={c.id} />}
                  onClick={() => onApply(c.id)}
                  onMouseEnter={() => onPreview?.(c.id)}
                />
                <button
                  type="button"
                  className={favorites.includes(c.id) ? "cc-fav on" : "cc-fav"}
                  title="Favorite"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFav(c.id);
                  }}
                >
                  ★
                </button>
              </div>
            ))}
            {list.length === 0 && <p className="cc-empty">No transitions here yet</p>}
          </div>
        );
      }}
    </CapCutLibraryShell>
  );
}

export function EffectLibrary({ onAdd }: { onAdd: (kind: EffectKind) => void }) {
  return (
    <CapCutLibraryShell title="Effects" categories={EFFECT_CATEGORIES} searchPlaceholder="Search effects…">
      {({ category, query }) => {
        const list = EFFECT_CARDS.filter(
          (c) => (category === "all" || c.category === category) && matches(query, c.label, c.hint),
        );
        return (
          <div className="cc-grid cc-grid-3">
            {list.map((c) => (
              <CapCutCard
                key={c.kind}
                label={c.label}
                sub={c.hint}
                preview={<EffectPreview kind={c.kind} />}
                onClick={() => onAdd(c.kind)}
              />
            ))}
            {list.length === 0 && <p className="cc-empty">No effects match</p>}
          </div>
        );
      }}
    </CapCutLibraryShell>
  );
}

export function FilterLibrary({
  selected,
  onApply,
}: {
  selected?: string;
  onApply: (id: string, grade: Omit<ColorGrade, "preset">) => void;
}) {
  return (
    <CapCutLibraryShell title="Filters" categories={FILTER_CATEGORIES} searchPlaceholder="Search filters…">
      {({ query }) => {
        const list = FILTER_CARDS.filter((c) => matches(query, c.label, c.category));
        return (
          <div className="cc-grid cc-grid-3">
            {list.map((c) => (
              <CapCutCard
                key={c.id}
                label={c.label}
                active={selected === c.id}
                preview={<FilterPreview swatch={c.preview} />}
                onClick={() => onApply(c.id, c.grade)}
              />
            ))}
            {list.length === 0 && <p className="cc-empty">No filters match</p>}
          </div>
        );
      }}
    </CapCutLibraryShell>
  );
}

export function AnimationLibrary({
  onApplyText,
}: {
  onApplyText: (anim: "none" | "fade" | "slide" | "pop" | "zoom", label: string) => void;
}) {
  return (
    <CapCutLibraryShell
      title="Animations"
      categories={ANIM_CATEGORIES}
      searchPlaceholder="Search animations…"
    >
      {({ category, query }) => {
        const list = ANIM_CARDS.filter((c) => {
          if (!matches(query, c.label, c.style)) return false;
          if (category === "all") return true;
          if (category === "loop") return c.phase === "loop";
          if (category === "in") return c.phase === "in";
          if (category === "out") return c.phase === "out";
          return c.phase === "combo" || c.phase === category;
        });
        return (
          <div className="cc-grid cc-grid-3">
            {list.map((c) => (
              <CapCutCard
                key={c.id}
                label={c.label}
                preview={
                  <span
                    className={`cc-fx-box cc-anim cc-anim-photo cc-anim-${c.preview}`}
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="cc-anim-bg"
                      src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=320&h=200&fit=crop&q=60"
                      alt=""
                      draggable={false}
                    />
                    <span className="cc-anim-glyph">Aa</span>
                  </span>
                }
                onClick={() => onApplyText(c.textAnim, c.label)}
              />
            ))}
            {list.length === 0 && <p className="cc-empty">No animations here</p>}
          </div>
        );
      }}
    </CapCutLibraryShell>
  );
}

export function StickerLibrary({
  onGlyph,
  onPack,
}: {
  onGlyph: (glyph: string) => void;
  onPack: (src: string, label: string) => void;
}) {
  return (
    <div className="cc-lib">
      <header className="cc-lib-head">
        <h3 className="cc-lib-title">Stickers</h3>
        <p className="cc-lib-hint">Tap to place on the timeline</p>
      </header>
      <p className="cc-section-label">Emoji</p>
      <div className="cc-grid">
        {STICKER_PRESETS.map((s) => (
          <CapCutCard
            key={s.id}
            label={s.label}
            preview={
              <span className="cc-fx-box cc-sticker-prev" aria-hidden>
                <span className="cc-sticker-glyph">{s.glyph}</span>
              </span>
            }
            onClick={() => onGlyph(s.glyph)}
          />
        ))}
      </div>
      <p className="cc-section-label">Packs</p>
      <div className="cc-grid">
        {STICKER_PACK.map((s) => (
          <CapCutCard
            key={s.id}
            label={s.label}
            preview={
              <span className="cc-fx-box cc-sticker-prev" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src.endsWith(".json") ? "/stickers/star.svg" : s.src} alt="" />
              </span>
            }
            onClick={() => onPack(s.src, s.label)}
          />
        ))}
      </div>
    </div>
  );
}
