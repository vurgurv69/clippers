/** Detect spoken language from transcript text. */
export function detectScriptLanguage(text: string): "ar" | "en" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (arabic > latin * 0.35 && arabic >= 3) return "ar";
  return "en";
}

const EN_STOP = new Set(
  `
  a an the and or but if so to of in on at for from with as is are was were be been being
  i you he she it we they me him her us them my your his its our their this that these those
  just like really very gonna wanna kinda um uh oh yeah yes no not do does did doing done
  have has had having will would could should can about into over out up down then than
  what when where who why how all any some more most other such only own same too also
  there here when while because until although though after before again further once
  untitled video moment key
`.split(/\s+/).filter(Boolean),
);

const AR_STOP = new Set(
  `
  في من على إلى عن مع هذا هذه ذلك تلك التي الذي الذين اللواتي ما لا لم لن إن أن
  كان يكون تكون كنت كانوا قد هل أو و ف ب ك يا هو هي هم هن أنا نحن أنت أنتم
  اللي ال الي ده دي هناك هنا بعد قبل بين حتى أيضا أيضاً كل أي بعض غير فقط
`.split(/\s+/).filter(Boolean),
);

const EN_ACTIONS = [
  "score", "scores", "scored", "scoring", "goal", "goals", "win", "wins", "won",
  "kill", "kills", "reveal", "reveals", "admit", "admits", "explain", "explains",
  "break", "breaks", "build", "builds", "launch", "launches", "buy", "buys",
  "sell", "sells", "fight", "fights", "argue", "argues", "discover", "discovers",
  "prove", "proves", "lose", "loses", "lost", "save", "saves", "miss", "misses",
  "assist", "assists", "champion", "final", "penalty", "hattrick", "hat-trick",
  "say", "says", "said", "tell", "tells", "call", "calls", "show", "shows",
];

const AR_ACTIONS = [
  "يسجل", "سجل", "تسجيل", "هدف", "أهداف", "يفوز", "فاز", "يفضح", "يعترف",
  "يشرح", "يكشف", "يشتري", "يبيع", "يحارب", "يقاتل", "ينقذ", "يضيع",
  "ركلة", "جزاء", "نهائي", "بطولة", "يقول", "قال", "يروي", "يحكي",
];

function tokenize(text: string): string[] {
  return text
    .replace(/["""'']/g, "")
    .split(/[\s,.;:!?\u060C\u061B\u061F]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isContentToken(token: string, lang: "ar" | "en") {
  const lower = token.toLowerCase();
  if (lang === "ar") {
    if (AR_STOP.has(token) || AR_STOP.has(lower)) return false;
    return /[\u0600-\u06FF]/.test(token) || /[A-Za-z0-9]/.test(token);
  }
  if (EN_STOP.has(lower)) return false;
  if (lower.length <= 2 && !/^[A-Z]/.test(token)) return false;
  return /[A-Za-z0-9]/.test(token);
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?؟۔])\s+|\n+|(?<=\s)(?=[A-Z\u0600-\u06FF])/u)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 6);
}

function scoreSentence(sentence: string, lang: "ar" | "en", videoTitle: string) {
  const tokens = tokenize(sentence);
  if (!tokens.length) return 0;

  let score = 0;
  const titleTokens = new Set(
    tokenize(videoTitle).map((t) => t.toLowerCase()).filter((t) => t.length > 2),
  );

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (isContentToken(token, lang)) score += 1.2;
    if (/^[A-Z][a-z]{2,}/.test(token)) score += 3;
    if (titleTokens.has(lower)) score += 2;
    if (lang === "en" && EN_ACTIONS.includes(lower)) score += 5;
    if (lang === "ar" && AR_ACTIONS.some((a) => token.includes(a))) score += 5;
  }

  const len = tokens.length;
  if (len >= 4 && len <= 14) score += 3;
  if (len > 20) score -= 4;
  return score;
}

function compressTitle(sentence: string, lang: "ar" | "en", maxWords = 8): string {
  const tokens = tokenize(sentence);
  const content: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const keep =
      isContentToken(token, lang) ||
      (lang === "en" && EN_ACTIONS.includes(lower)) ||
      (lang === "ar" && AR_ACTIONS.some((a) => token.includes(a))) ||
      /^[A-Z][a-z]/.test(token);
    if (keep) content.push(token);
    if (content.length >= maxWords) break;
  }

  const words = (content.length >= 3 ? content : tokens).slice(0, maxWords);
  let title = words.join(" ").replace(/\s+/g, " ").trim();
  title = title.replace(/^(and|but|so|then|و|ف|إن|أن)\s+/i, "");
  title = title.replace(/[,:;]+$/g, "");
  if (lang === "en" && title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

function formatTimecode(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeKey(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Topic title from the clip's own words. Guarantees uniqueness vs usedTitles.
 */
export function topicTitleFromTranscript(opts: {
  text: string;
  videoTitle: string;
  start: number;
  usedTitles?: Set<string>;
}): string {
  const { text, videoTitle, start, usedTitles } = opts;
  const cleaned = text.replace(/\s+/g, " ").trim();
  const lang = detectScriptLanguage(cleaned || videoTitle);
  const candidates: string[] = [];

  if (cleaned.length >= 8) {
    // Prefer the opening hook of THIS clip (different windows → different titles)
    const hookWindow = cleaned.split(/\s+/).slice(0, 14).join(" ");
    candidates.push(compressTitle(hookWindow, lang, lang === "ar" ? 8 : 7));

    const sentences = sentenceSplit(cleaned);
    const ranked = (sentences.length ? sentences : [cleaned])
      .map((s) => ({ s, score: scoreSentence(s, lang, videoTitle) }))
      .sort((a, b) => b.score - a.score);

    for (const { s } of ranked.slice(0, 5)) {
      candidates.push(compressTitle(s, lang, lang === "ar" ? 9 : 8));
    }

    // Sliding mid-clip windows for more variety
    const tokens = tokenize(cleaned);
    for (let i = 0; i < tokens.length - 5; i += 5) {
      candidates.push(compressTitle(tokens.slice(i, i + 8).join(" "), lang, 7));
    }
  }

  const fromVideo = compressTitle(videoTitle, detectScriptLanguage(videoTitle), 6);
  if (fromVideo && !/^untitled/i.test(fromVideo)) {
    candidates.push(`${fromVideo} · ${formatTimecode(start)}`);
  }

  candidates.push(
    lang === "ar"
      ? `لحظة عند ${formatTimecode(start)}`
      : `Moment at ${formatTimecode(start)}`,
  );

  for (const raw of candidates) {
    const title = raw.replace(/\s+/g, " ").trim().slice(0, 90);
    if (title.length < 4) continue;
    const key = normalizeKey(title);
    if (usedTitles?.has(key)) continue;
    usedTitles?.add(key);
    return title;
  }

  const fallback =
    lang === "ar"
      ? `مقطع ${formatTimecode(start)}`
      : `Clip ${formatTimecode(start)}`;
  usedTitles?.add(normalizeKey(fallback));
  return fallback;
}

export function topicHookFromTranscript(text: string, title: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return title;
  const lang = detectScriptLanguage(cleaned);
  const words = tokenize(cleaned).slice(0, lang === "ar" ? 12 : 10);
  const hook = words.join(" ");
  return hook.length < cleaned.length ? `${hook}…` : hook;
}
