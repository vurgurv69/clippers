/**
 * Caption font resolution — Latin UI fonts + full Arabic Unicode coverage.
 */
export const CAPTION_FONTS = [
  "Montserrat",
  "TheBoldFont",
  "Poppins",
  "Inter",
  "Impact",
] as const;

export type CaptionFontFamily = (typeof CAPTION_FONTS)[number];
export type CaptionAlign = "bottom" | "middle" | "top";

export const CAPTION_FONT_ASS: Record<CaptionFontFamily, string> = {
  Montserrat: "Montserrat",
  TheBoldFont: "The Bold Font",
  Poppins: "Poppins",
  Inter: "Inter",
  Impact: "Impact",
};

/** Preferred Arabic / RTL ASS fonts (Amiri primary · Tahoma Windows fallback). */
export const ARABIC_CAPTION_FONTS = ["Amiri", "Tahoma", "Cairo", "Arial", "Segoe UI"] as const;

/** ASS Alignment: 2 bottom-center, 5 middle-center, 8 top-center. */
export function captionAlignment(align?: CaptionAlign | string): {
  alignment: 2 | 5 | 8;
  an: 2 | 5 | 8;
  marginV: number;
} {
  if (align === "top") return { alignment: 8, an: 8, marginV: 160 };
  if (align === "middle") return { alignment: 5, an: 5, marginV: 40 };
  return { alignment: 2, an: 2, marginV: 380 };
}

/**
 * Resolve burn-in font. RTL / Arabic always uses a Unicode Arabic-capable face
 * so glyphs never tofu and BiDi shaping stays correct.
 * Prefer Amiri; Tahoma is the Windows-guaranteed fallback (override via ARABIC_CAPTION_FONT).
 */
export function resolveCaptionFont(
  family?: CaptionFontFamily | string,
  rtl = false,
): string {
  if (rtl) {
    const override = (process.env.ARABIC_CAPTION_FONT || "").trim();
    if (override) return override;
    // Amiri first (spec); hosts without it typically substitute via libass/fontconfig.
    return "Amiri";
  }
  if (family && family in CAPTION_FONT_ASS) {
    return CAPTION_FONT_ASS[family as CaptionFontFamily];
  }
  return "Montserrat";
}

/** Full RTL font preference list for ASS (primary + fallbacks). */
export function arabicFontStack(): string[] {
  const override = (process.env.ARABIC_CAPTION_FONT || "").trim();
  if (override) return [override, ...ARABIC_CAPTION_FONTS.filter((f) => f !== override)];
  return [...ARABIC_CAPTION_FONTS];
}

export function clampFontSize(raw: unknown, fallback = 72): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(32, Math.min(120, n));
}

export function clampOutline(raw: unknown, fallback = 6): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(16, n));
}
