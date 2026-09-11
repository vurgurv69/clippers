import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ffmpegPath, ffprobePath, runCommand, ytDlpPath } from "@/lib/binaries";
import { addAsset, assetsDir, getProject, workDir } from "@/lib/editor-project";
import type { ProjectAsset } from "@/lib/editor-types";
import { PathSafetyError } from "@/lib/safe-id";
import {
  assertUploadSize,
  assertVideoMagic,
  UploadValidationError,
} from "@/lib/upload-validate";
import { assertSafeMediaUrl, UrlSafetyError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);

async function probeDuration(filePath: string) {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      filePath,
    ]);
    const data = JSON.parse(stdout) as { format?: { duration?: string } };
    return Number.parseFloat(data.format?.duration || "0") || 0;
  } catch {
    return 0;
  }
}

async function extractToM4a(src: string, dest: string) {
  await runCommand(ffmpegPath(), [
    "-y",
    "-i",
    src,
    "-vn",
    "-acodec",
    "aac",
    "-b:a",
    "192k",
    dest,
  ]);
}

/**
 * POST /api/editor/project/:id/audio-import
 * - multipart: file (video) → extract audio track
 * - JSON: { youtubeUrl } → download audio via yt-dlp
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await fs.mkdir(assetsDir(id), { recursive: true });
    await fs.mkdir(workDir(id), { recursive: true });

    const ctype = request.headers.get("content-type") || "";
    let srcPath = "";
    let displayName = "Audio";
    let cleanup: string[] = [];

    if (ctype.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No video file provided." }, { status: 400 });
      }
      const ext = path.extname(file.name).toLowerCase();
      if (!VIDEO_EXT.has(ext)) {
        return NextResponse.json(
          { error: "Pick a video file (mp4, mov, webm, mkv…)." },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      assertUploadSize(buf.length);
      assertVideoMagic(buf);
      const tmp = path.join(workDir(id), `extract-src-${crypto.randomUUID()}${ext}`);
      await fs.writeFile(tmp, buf);
      srcPath = tmp;
      cleanup.push(tmp);
      displayName = `${file.name.replace(/\.[^.]+$/, "")} (audio)`;
    } else {
      const body = (await request.json().catch(() => ({}))) as { youtubeUrl?: string };
      const raw = (body.youtubeUrl || "").trim();
      let safeUrl: URL;
      try {
        safeUrl = await assertSafeMediaUrl(raw);
      } catch (err) {
        if (err instanceof UrlSafetyError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
      const host = safeUrl.hostname.toLowerCase();
      const isYt =
        host === "youtu.be" ||
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "www.youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com";
      if (!isYt) {
        return NextResponse.json(
          { error: "Paste a valid YouTube link." },
          { status: 400 },
        );
      }
      const url = safeUrl.toString();
      const outBase = path.join(workDir(id), `yt-audio-${crypto.randomUUID()}`);
      try {
        await runCommand(ytDlpPath(), [
          "-f",
          "bestaudio/best",
          "-x",
          "--audio-format",
          "m4a",
          "--audio-quality",
          "0",
          "-o",
          `${outBase}.%(ext)s`,
          "--no-playlist",
          url,
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "YouTube download failed";
        return NextResponse.json(
          { error: msg.includes("yt-dlp") ? msg : `YouTube audio failed: ${msg}` },
          { status: 502 },
        );
      }
      const candidates = [
        `${outBase}.m4a`,
        `${outBase}.webm`,
        `${outBase}.opus`,
        `${outBase}.mp3`,
        `${outBase}.wav`,
      ];
      let found = "";
      for (const c of candidates) {
        try {
          await fs.access(c);
          found = c;
          break;
        } catch {
          // try next
        }
      }
      if (!found) {
        const files = await fs.readdir(workDir(id));
        const hit = files
          .filter((f) => f.startsWith(path.basename(outBase)))
          .map((f) => path.join(workDir(id), f))[0];
        if (!hit) {
          return NextResponse.json({ error: "Downloaded audio file not found." }, { status: 502 });
        }
        found = hit;
      }
      srcPath = found;
      cleanup.push(found);
      displayName = "YouTube audio";
      try {
        const { stdout } = await runCommand(ytDlpPath(), [
          "--skip-download",
          "--print",
          "%(title)s",
          "--no-playlist",
          url,
        ]);
        const title = stdout.trim().split("\n")[0];
        if (title) displayName = title.slice(0, 80);
      } catch {
        // keep default name
      }
    }

    const assetId = crypto.randomUUID();
    const filename = `${assetId}.m4a`;
    const dest = path.join(assetsDir(id), filename);

    if (srcPath.toLowerCase().endsWith(".m4a") && ctype.includes("application/json")) {
      await fs.copyFile(srcPath, dest);
    } else {
      await extractToM4a(srcPath, dest);
    }

    const duration = await probeDuration(dest);
    const asset: ProjectAsset = {
      id: assetId,
      kind: "audio",
      name: displayName,
      filename,
      duration: duration || 30,
      hasAudio: true,
    };
    await addAsset(id, asset);

    for (const p of cleanup) {
      try {
        await fs.unlink(p);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ asset });
  } catch (err) {
    if (err instanceof UploadValidationError || err instanceof UrlSafetyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof PathSafetyError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : "Audio import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
