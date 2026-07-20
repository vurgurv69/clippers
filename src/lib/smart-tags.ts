/**
 * Heuristic smart tags for uploaded assets (Phase 2).
 */

import type { AssetKind } from "./editor-types";

export function smartTagsForAsset(opts: {
  kind: AssetKind;
  name: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}): string[] {
  const tags = new Set<string>();
  tags.add(opts.kind);

  const name = opts.name.toLowerCase();
  const w = opts.width || 0;
  const h = opts.height || 0;

  if (opts.kind === "video" || opts.kind === "image") {
    if (h > w * 1.1) tags.add("vertical");
    else if (w > h * 1.2) tags.add("landscape");
    else if (w && h) tags.add("square");

    if (Math.max(w, h) >= 2160) tags.add("4k");
    else if (Math.max(w, h) >= 1080) tags.add("hd");
  }

  if (opts.kind === "video") {
    if (opts.duration > 0 && opts.duration <= 60) tags.add("short");
    else if (opts.duration > 60 && opts.duration <= 180) tags.add("mid");
    else if (opts.duration > 180) tags.add("long");
    if (opts.hasAudio) tags.add("has-audio");
    else tags.add("silent");
  }

  if (opts.kind === "audio") tags.add("music-bed");
  if (opts.kind === "lut") tags.add("color");
  if (opts.kind === "font") tags.add("typography");

  const keywordMap: [RegExp, string][] = [
    [/game|gameplay|fortnite|valorant|minecraft/i, "gaming"],
    [/podcast|interview|talk/i, "podcast"],
    [/vlog|travel|day.in/i, "vlog"],
    [/screen|record|desktop/i, "screencast"],
    [/drone|aerial/i, "drone"],
    [/b-?roll|broll/i, "b-roll"],
    [/intro|outro|logo/i, "branding"],
    [/tiktok|reel|short/i, "social"],
  ];
  for (const [re, tag] of keywordMap) {
    if (re.test(name)) tags.add(tag);
  }

  return Array.from(tags).slice(0, 10);
}
