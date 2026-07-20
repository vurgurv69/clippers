"use client";

import { useEffect, useState } from "react";
import {
  ANIM_CARDS,
  ANIM_CATEGORIES,
  EFFECT_CARDS,
  EFFECT_CATEGORIES,
  FILTER_CARDS,
  FILTER_CATEGORIES,
  PROJECT_TEMPLATES,
  TEXT_CARDS,
  TEXT_CATEGORIES,
  TRANSITION_CARDS,
  TRANSITION_CATEGORIES,
} from "@/lib/capcut-catalog";
import { STICKER_PACK, STICKER_PRESETS } from "@/lib/editor-types";
import type { ColorGrade, EffectKind, TextOverlay, TransitionKind } from "@/lib/editor-types";
import type { BrandKit } from "@/lib/growth-types";
import { CapCutCard, CapCutLibraryShell } from "@/components/editor/library/CapCutLibraryShell";
import {
  EffectPreview,
  FilterPreview,
  TextPreview,
  TransitionPreview,
} from "@/components/editor/library/FxPreviewBox";

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
          if (!matches(query, c.label, c.category)) return false;
          if (category === "all") return true;
          if (category === "favorites") return favorites.includes(c.id);
          return c.category === category;
        });
        return (
          <div className="cc-grid">
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
          <div className="cc-grid">
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
  const cats = [{ id: "all", label: "All" }, ...FILTER_CATEGORIES];
  return (
    <CapCutLibraryShell title="Filters" categories={cats} searchPlaceholder="Search filters…">
      {({ category, query }) => {
        const list = FILTER_CARDS.filter(
          (c) =>
            (category === "all" || c.category === category) &&
            matches(query, c.label, c.category),
        );
        return (
          <div className="cc-grid">
            {list.map((c) => (
              <CapCutCard
                key={c.id}
                label={c.label}
                active={selected === c.id}
                preview={<FilterPreview swatch={c.preview} />}
                onClick={() => onApply(c.id, c.grade)}
              />
            ))}
            {list.length === 0 && <p className="cc-empty">Try another category</p>}
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
        const list = ANIM_CARDS.filter(
          (c) => c.phase === category && matches(query, c.label, c.style),
        );
        return (
          <div className="cc-grid">
            {list.map((c) => (
              <CapCutCard
                key={c.id}
                label={c.label}
                sub={c.style}
                preview={
                  <span className={`cc-fx-box cc-anim cc-anim-${c.preview}`} aria-hidden>
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

export function TemplateLibrary({
  onPickAspect,
  onApplyTextStyle,
  onApplyColorGrade,
  brandKit,
  onApplyBrandKit,
}: {
  onPickAspect: (aspect: "9:16" | "16:9" | "1:1") => void;
  onApplyTextStyle?: (style: Partial<TextOverlay>, label: string) => void;
  onApplyColorGrade?: (grade: Omit<ColorGrade, "preset">, label: string) => void;
  brandKit?: BrandKit | null;
  onApplyBrandKit?: (kit: BrandKit) => void;
}) {
  const savedKey = "clippers.marketplace.presets";
  const packKey = "clippers.marketplace.packs";

  function parsePackBrandKit(raw?: Record<string, unknown>): BrandKit | null {
    if (!raw || typeof raw.primary !== "string") return null;
    return {
      primary: String(raw.primary),
      secondary: String(raw.secondary || "#0b1f1a"),
      accent: String(raw.accent || "#f59e0b"),
      fontHeading: String(raw.fontHeading || "Impact"),
      fontBody: String(raw.fontBody || "Arial"),
      logoUrl: raw.logoUrl ? String(raw.logoUrl) : undefined,
      watermark: raw.watermark ? String(raw.watermark) : undefined,
    };
  }

  type PulledPack = {
    id: string;
    label: string;
    textPresets: { id: string; label: string; style: Record<string, unknown> }[];
    colorPresets: { id: string; label: string; grade: Record<string, unknown> }[];
    brandKit?: Record<string, unknown>;
  };
  const [saved, setSaved] = useState<{ id: string; label: string; at: string }[]>([]);
  const [remote, setRemote] = useState<{ id: string; label: string; updatedAt: string }[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [pulledPack, setPulledPack] = useState<PulledPack | null>(null);

  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(savedKey) || "[]"));
    } catch {
      setSaved([]);
    }
    void (async () => {
      try {
        const res = await fetch("/api/marketplace");
        const data = await res.json();
        if (res.ok) {
          setRemote(
            (data.packs || []).map((p: { id: string; label: string; updatedAt: string }) => ({
              id: p.id,
              label: p.label,
              updatedAt: p.updatedAt,
            })),
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  function saveCurrentPresetList() {
    const entry = {
      id: `mp-${Date.now()}`,
      label: `My pack ${saved.length + 1}`,
      at: new Date().toISOString(),
    };
    const next = [entry, ...saved].slice(0, 12);
    setSaved(next);
    try {
      localStorage.setItem(savedKey, JSON.stringify(next));
      // Persist a mini pack of current catalog cards for re-apply
      const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<
        string,
        unknown
      >;
      packs[entry.id] = {
        id: entry.id,
        label: entry.label,
        textPresets: TEXT_CARDS.slice(0, 8).map((c) => ({
          id: c.id,
          label: c.label,
          style: c.style,
        })),
        colorPresets: FILTER_CARDS.slice(0, 6).map((c) => ({
          id: c.id,
          label: c.label,
          grade: c.grade,
        })),
        ...(brandKit ? { brandKit: brandKit as Record<string, unknown> } : {}),
      };
      localStorage.setItem(packKey, JSON.stringify(packs));
    } catch {
      // ignore
    }
    setSyncMsg("Saved local pack — pull Apply to use styles");
  }

  async function syncPush() {
    setSyncMsg("");
    try {
      const id = `pack-${Date.now()}`;
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          pack: {
            id,
            label: `Studio pack ${new Date().toLocaleDateString()}`,
            textPresets: TEXT_CARDS.slice(0, 12).map((c) => ({
              id: c.id,
              label: c.label,
              style: c.style as Record<string, unknown>,
            })),
            colorPresets: FILTER_CARDS.slice(0, 8).map((c) => ({
              id: c.id,
              label: c.label,
              grade: c.grade as unknown as Record<string, unknown>,
            })),
            ...(brandKit ? { brandKit: brandKit as Record<string, unknown> } : {}),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncMsg("Pushed to marketplace");
      setRemote((prev) => [
        { id: data.pack.id, label: data.pack.label, updatedAt: data.pack.updatedAt },
        ...prev,
      ]);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    }
  }

  async function syncPull(id: string) {
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pull failed");
      const pack = data.pack as {
        id: string;
        label: string;
        updatedAt: string;
        textPresets?: { id: string; label: string; style: Record<string, unknown> }[];
        colorPresets?: { id: string; label: string; grade: Record<string, unknown> }[];
        brandKit?: Record<string, unknown>;
      };
      const entry = {
        id: pack.id,
        label: pack.label,
        at: pack.updatedAt,
      };
      const next = [entry, ...saved.filter((s) => s.id !== entry.id)].slice(0, 12);
      setSaved(next);
      localStorage.setItem(savedKey, JSON.stringify(next));
      const full: PulledPack = {
        id: pack.id,
        label: pack.label,
        textPresets: pack.textPresets || [],
        colorPresets: pack.colorPresets || [],
        brandKit: pack.brandKit,
      };
      setPulledPack(full);
      try {
        const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<
          string,
          unknown
        >;
        packs[pack.id] = full;
        localStorage.setItem(packKey, JSON.stringify(packs));
      } catch {
        // ignore
      }
      setSyncMsg(`Pulled “${entry.label}” — apply below`);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Pull failed");
    }
  }

  function loadLocalPack(id: string) {
    try {
      const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<
        string,
        PulledPack
      >;
      if (packs[id]) {
        setPulledPack(packs[id]);
        setSyncMsg(`Loaded “${packs[id].label}”`);
      } else {
        setSyncMsg("No style payload for that pack — pull from cloud again");
      }
    } catch {
      setSyncMsg("Could not load pack");
    }
  }

  function applyPulledPack() {
    if (!pulledPack) return;
    let n = 0;
    for (const t of pulledPack.textPresets.slice(0, 3)) {
      onApplyTextStyle?.(t.style as Partial<TextOverlay>, t.label);
      n++;
    }
    const color = pulledPack.colorPresets[0];
    if (color) {
      onApplyColorGrade?.(color.grade as Omit<ColorGrade, "preset">, color.label);
      n++;
    }
    const kit = parsePackBrandKit(pulledPack.brandKit);
    if (kit && onApplyBrandKit) {
      onApplyBrandKit(kit);
      n++;
    }
    setSyncMsg(n ? `Applied ${n} presets from “${pulledPack.label}”` : "Pack had no presets");
  }

  function applyBrandFromPack() {
    if (!pulledPack) return;
    const kit = parsePackBrandKit(pulledPack.brandKit);
    if (!kit || !onApplyBrandKit) {
      setSyncMsg("No brand kit in this pack");
      return;
    }
    onApplyBrandKit(kit);
    setSyncMsg(`Brand kit applied from “${pulledPack.label}”`);
  }

  const pulledBrandKit = pulledPack ? parsePackBrandKit(pulledPack.brandKit) : null;

  return (
    <div className="cc-lib">
      <header className="cc-lib-head">
        <h3 className="cc-lib-title">Templates</h3>
        <p className="cc-lib-hint">Pick a canvas, then import your clips.</p>
      </header>
      <div className="cc-grid templates">
        {PROJECT_TEMPLATES.map((t) => (
          <CapCutCard
            key={t.id}
            label={t.label}
            sub={t.hint}
            preview={
              <span
                className={`cc-fx-box cc-tpl ${t.aspect === "9:16" ? "tall" : t.aspect === "1:1" ? "sq" : "wide"}`}
                aria-hidden
              >
                <span className="cc-tpl-frame" />
              </span>
            }
            onClick={() => onPickAspect(t.aspect)}
          />
        ))}
      </div>
      <div className="cc-shell-panel" style={{ marginTop: "0.85rem" }}>
        <h3 className="cc-lib-title">Marketplace</h3>
        <p className="cc-lib-hint">Push / pull packs, then apply text + color to the timeline.</p>
        <div className="cc-ai-actions">
          <button type="button" className="btn" onClick={saveCurrentPresetList}>
            Save locally
          </button>
          <button type="button" className="btn primary" onClick={() => void syncPush()}>
            Sync push
          </button>
          {pulledPack && (
            <button type="button" className="btn" onClick={applyPulledPack}>
              Apply “{pulledPack.label.slice(0, 18)}”
            </button>
          )}
          {pulledBrandKit && onApplyBrandKit && (
            <button type="button" className="btn" onClick={applyBrandFromPack}>
              Apply brand from pack
            </button>
          )}
        </div>
        {syncMsg && <p className="cc-copied">{syncMsg}</p>}
        <ul className="cc-ai-list" style={{ marginTop: "0.5rem" }}>
          {saved.map((s) => (
            <li key={s.id}>
              <button type="button" className="cc-ai-item" onClick={() => loadLocalPack(s.id)}>
                <span className="cc-ai-emoji">▦</span>
                <span className="cc-ai-meta">
                  <strong>{s.label}</strong>
                  <span>{new Date(s.at).toLocaleString()} · load</span>
                </span>
              </button>
            </li>
          ))}
          {remote.map((r) => (
            <li key={`r-${r.id}`}>
              <button type="button" className="cc-ai-item" onClick={() => void syncPull(r.id)}>
                <span className="cc-ai-emoji">☁</span>
                <span className="cc-ai-meta">
                  <strong>{r.label}</strong>
                  <span>Cloud · pull</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
