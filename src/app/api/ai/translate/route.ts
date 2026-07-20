import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { llmComplete, parseLlmJson } from "@/lib/llm";
import type { DubTrackPiece, TranslateLang } from "@/lib/platform-types";
import type { TranscriptSegment } from "@/lib/types";
import { addAsset, assetsDir, getProject } from "@/lib/editor-project";
import { loadCachedTranscript } from "@/lib/media-activity";
import { ffprobePath, runCommand } from "@/lib/binaries";
import type { ProjectAsset } from "@/lib/editor-types";

export const runtime = "nodejs";
export const maxDuration = 300;

const LANG_NAMES: Record<TranslateLang, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
};

const VOICE_BY_LANG: Partial<Record<TranslateLang, string>> = {
  ar: "onyx",
  en: "alloy",
  es: "nova",
  fr: "shimmer",
  de: "echo",
  pt: "nova",
  hi: "alloy",
  ja: "shimmer",
  ko: "nova",
};

type Body = {
  projectId?: string;
  lang?: TranslateLang;
  segments?: TranscriptSegment[];
  text?: string;
  /** sample = first line preview; full = write audio assets for the timeline */
  dub?: boolean | "sample" | "full";
  /** Max TTS segments for full dub (default 10). */
  maxDubSegments?: number;
};

function heuristicTranslate(text: string, lang: TranslateLang): string {
  const tag = LANG_NAMES[lang] || lang;
  if (lang === "en") return text;
  return `[${tag}] ${text}`;
}

async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    return Number.parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function ttsToFile(
  text: string,
  dest: string,
  voice: string,
): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return false;
  const tts = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text.slice(0, 400),
    }),
  });
  if (!tts.ok) return false;
  const buf = Buffer.from(await tts.arrayBuffer());
  await fs.writeFile(dest, buf);
  return true;
}

/** POST /api/ai/translate — translate captions; optional sample or full TTS dub. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const lang = (body.lang || "ar") as TranslateLang;
    let segments = body.segments;
    const dubMode =
      body.dub === true || body.dub === "sample"
        ? "sample"
        : body.dub === "full"
          ? "full"
          : null;

    if ((!segments || !segments.length) && body.projectId) {
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const video = project.assets.find((a) => a.kind === "video");
      if (video) {
        const cached = await loadCachedTranscript(project.id, video.id);
        if (cached) segments = cached.segments;
      }
    }

    if ((!segments || !segments.length) && body.text) {
      segments = [
        {
          id: 0,
          start: 0,
          end: 5,
          text: body.text,
          words: [],
        },
      ];
    }

    if (!segments?.length) {
      return NextResponse.json(
        { error: "No transcript — transcribe first" },
        { status: 400 },
      );
    }

    const slice = segments.slice(0, 40);
    let usedLlm = false;
    let translated = slice.map((s) => ({
      start: s.start,
      end: s.end,
      text: heuristicTranslate(s.text, lang),
    }));

    const llm = await llmComplete({
      system: `You translate video captions. Reply JSON only: {"segments":[{"start":0,"end":1,"text":"..."}]}. Target language: ${LANG_NAMES[lang]}. Keep timing. Do not invent content.`,
      user: JSON.stringify(
        slice.map((s) => ({ start: s.start, end: s.end, text: s.text })),
      ),
      maxTokens: 2000,
      temperature: 0.2,
    });

    if (llm.usedLlm) {
      const parsed = parseLlmJson<{
        segments?: { start: number; end: number; text: string }[];
      }>(llm.text);
      if (parsed?.segments?.length) {
        translated = parsed.segments.map((s, i) => ({
          start: Number(s.start) || slice[i]?.start || 0,
          end: Number(s.end) || slice[i]?.end || 1,
          text: String(s.text || ""),
        }));
        usedLlm = true;
      }
    }

    let audioUrl: string | undefined;
    const dubTracks: DubTrackPiece[] = [];
    const voice = VOICE_BY_LANG[lang] || "alloy";

    if (dubMode === "sample" && process.env.OPENAI_API_KEY?.trim() && translated[0]?.text) {
      try {
        const tts = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice,
            input: translated[0].text.slice(0, 200),
          }),
        });
        if (tts.ok) {
          const buf = Buffer.from(await tts.arrayBuffer());
          audioUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
        }
      } catch {
        // sample optional
      }
    }

    if (dubMode === "full") {
      if (!body.projectId) {
        return NextResponse.json(
          { error: "projectId required for full dub" },
          { status: 400 },
        );
      }
      if (!process.env.OPENAI_API_KEY?.trim()) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY required for full dub TTS" },
          { status: 400 },
        );
      }
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const maxSeg = Math.min(12, Math.max(1, Number(body.maxDubSegments) || 10));
      const toDub = translated.filter((s) => s.text.trim()).slice(0, maxSeg);
      await fs.mkdir(assetsDir(body.projectId), { recursive: true });

      for (let i = 0; i < toDub.length; i++) {
        const seg = toDub[i];
        const assetId = crypto.randomUUID();
        const filename = `${assetId}.mp3`;
        const dest = path.join(assetsDir(body.projectId), filename);
        const ok = await ttsToFile(seg.text, dest, voice);
        if (!ok) continue;
        let duration = await probeDuration(dest);
        if (duration < 0.2) {
          duration = Math.max(0.5, (seg.end || 0) - (seg.start || 0));
        }
        const asset: ProjectAsset = {
          id: assetId,
          kind: "audio",
          name: `Dub ${LANG_NAMES[lang]} #${i + 1}`,
          filename,
          duration,
          hasAudio: true,
          tags: ["dub", lang],
        };
        await addAsset(body.projectId, asset);
        dubTracks.push({
          asset: {
            id: asset.id,
            kind: "audio",
            name: asset.name,
            filename: asset.filename,
            duration: asset.duration,
            hasAudio: true,
            tags: asset.tags,
          },
          start: seg.start,
          duration,
          text: seg.text,
        });
      }

      if (!dubTracks.length) {
        return NextResponse.json(
          { error: "TTS produced no audio — check API key / model" },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      lang,
      segments: translated,
      usedLlm,
      audioUrl,
      dubTracks,
      captionStyles: translated.map((s, i) => ({
        text: s.text,
        start: s.start,
        index: i,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
