"use client";

import { useEffect, useState } from "react";
import {
  FILTER_CARDS,
  PROJECT_TEMPLATES,
  TEXT_CARDS,
} from "@/lib/capcut-catalog";
import type { ColorGrade, TextOverlay } from "@/lib/editor-types";
import type { BrandKit } from "@/lib/growth-types";

type Props = {
  onPickAspect: (aspect: "9:16" | "16:9" | "1:1") => void;
  onApplyTextStyle?: (style: Partial<TextOverlay>, label: string) => void;
  onApplyColorGrade?: (grade: Omit<ColorGrade, "preset">, label: string) => void;
  brandKit?: BrandKit | null;
  onApplyBrandKit?: (kit: BrandKit) => void;
};

/**
 * Canvas templates + optional style packs (saved text/color presets).
 * Stickers intentionally omitted — use Inspector → Text for overlays.
 */
export function TemplateLibrary({
  onPickAspect,
  onApplyTextStyle,
  onApplyColorGrade,
  brandKit,
  onApplyBrandKit,
}: Props) {
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
      const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<string, unknown>;
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
    setSyncMsg("Saved — tap a pack below to load it");
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
      setSyncMsg("Shared to cloud packs");
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
      const pack = data.pack as PulledPack & { updatedAt: string };
      const entry = { id: pack.id, label: pack.label, at: pack.updatedAt };
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
        const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<string, unknown>;
        packs[pack.id] = full;
        localStorage.setItem(packKey, JSON.stringify(packs));
      } catch {
        // ignore
      }
      setSyncMsg(`Loaded “${entry.label}” — apply below`);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Pull failed");
    }
  }

  function loadLocalPack(id: string) {
    try {
      const packs = JSON.parse(localStorage.getItem(packKey) || "{}") as Record<string, PulledPack>;
      if (packs[id]) {
        setPulledPack(packs[id]);
        setSyncMsg(`Loaded “${packs[id].label}”`);
      } else {
        setSyncMsg("No styles in that pack — save or pull again");
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
    setSyncMsg(n ? `Applied ${n} styles from “${pulledPack.label}”` : "Pack had no styles");
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
    <div className="cc-lib cc-tpl-lib">
      <header className="cc-lib-head">
        <h3 className="cc-lib-title">Templates</h3>
        <p className="cc-lib-hint">Pick a canvas size — each template is its own card.</p>
      </header>

      <div className="cc-tpl-stack">
        {PROJECT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="cc-tpl-solo"
            onClick={() => onPickAspect(t.aspect)}
          >
            <span
              className={`cc-tpl-frame-wrap ${
                t.aspect === "9:16" ? "tall" : t.aspect === "1:1" ? "sq" : "wide"
              }`}
              aria-hidden
            >
              <span className="cc-tpl-frame">
                <span className="cc-tpl-frame-ratio">{t.aspect}</span>
              </span>
            </span>
            <span className="cc-tpl-solo-meta">
              <strong>{t.label}</strong>
              <em>{t.hint}</em>
            </span>
          </button>
        ))}
      </div>

      <section className="cc-style-packs">
        <h3 className="cc-lib-title">Style packs</h3>
        <p className="cc-lib-hint">
          Optional: save text + color presets to reuse later, or pull a pack from this machine’s
          cloud folder. Not a public store — just your presets.
        </p>
        <div className="cc-ai-actions">
          <button type="button" className="btn" onClick={saveCurrentPresetList}>
            Save pack
          </button>
          <button type="button" className="btn" onClick={() => void syncPush()}>
            Share pack
          </button>
          {pulledPack && (
            <button type="button" className="btn primary" onClick={applyPulledPack}>
              Apply “{pulledPack.label.slice(0, 16)}”
            </button>
          )}
          {pulledBrandKit && onApplyBrandKit && (
            <button type="button" className="btn" onClick={applyBrandFromPack}>
              Apply brand
            </button>
          )}
        </div>
        {syncMsg && <p className="cc-copied">{syncMsg}</p>}
        <ul className="cc-pack-list">
          {saved.map((s) => (
            <li key={s.id}>
              <button type="button" className="cc-pack-item" onClick={() => loadLocalPack(s.id)}>
                <strong>{s.label}</strong>
                <span>{new Date(s.at).toLocaleString()} · local</span>
              </button>
            </li>
          ))}
          {remote.map((r) => (
            <li key={`r-${r.id}`}>
              <button type="button" className="cc-pack-item" onClick={() => void syncPull(r.id)}>
                <strong>{r.label}</strong>
                <span>Shared · open</span>
              </button>
            </li>
          ))}
          {saved.length === 0 && remote.length === 0 && (
            <li className="cc-lib-hint">No packs yet — Save pack to create one.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
