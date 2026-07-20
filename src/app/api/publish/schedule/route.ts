import { NextResponse } from "next/server";
import { loadTokens, uploadYoutubeVideo } from "@/lib/oauth";
import {
  buildYoutubeDescription,
  youtubeTagsFromPack,
} from "@/lib/youtube-publish-meta";
import {
  cancelScheduled,
  dueScheduled,
  enqueueScheduled,
  listScheduled,
  updateScheduled,
} from "@/lib/publish-queue";
import { ingestAnalytics } from "@/lib/analytics-store";
import { pushNotification } from "@/lib/publish-queue";
import type { PublishPlatform } from "@/lib/platform-types";
import fs from "fs";
import path from "path";
import { exportsDir, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/publish/schedule?projectId= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const jobs = await listScheduled(projectId);
    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "List failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/publish/schedule
 * { action: "enqueue"|"process"|"cancel", ... }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      projectId?: string;
      platform?: PublishPlatform;
      title?: string;
      description?: string;
      caption?: string;
      dueAt?: string;
      id?: string;
    };

    if (body.action === "cancel") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      await cancelScheduled(body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "retry") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const job = await updateScheduled(body.id, {
        status: "scheduled",
        error: undefined,
      });
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, job });
    }

    if (body.action === "process") {
      const due = await dueScheduled();
      const results: { id: string; ok: boolean; error?: string; url?: string }[] = [];
      for (const job of due) {
        await updateScheduled(job.id, { status: "publishing" });
        try {
          const dir = exportsDir(job.projectId);
          const names = fs.readdirSync(dir).filter((n) =>
            n.startsWith("export-") && /\.(mp4|mov|webm)$/i.test(n),
          );
          if (!names.length) throw new Error("No export file");
          names.sort(
            (a, b) =>
              fs.statSync(path.join(dir, b)).mtimeMs -
              fs.statSync(path.join(dir, a)).mtimeMs,
          );
          const filePath = path.join(dir, names[0]);
          const downloadUrl = `/api/editor/project/${job.projectId}/file/${encodeURIComponent(names[0])}`;

          if (job.platform === "youtube") {
            const tokens = await loadTokens("youtube");
            if (!tokens) throw new Error("YouTube not connected");
            const proj = await getProject(job.projectId);
            const pack = proj?.spec?.growthPack;
            const description =
              job.description || buildYoutubeDescription(pack);
            const uploaded = await uploadYoutubeVideo({
              filePath,
              title: job.title,
              description,
              privacy: "unlisted",
              tags: youtubeTagsFromPack(pack),
            });
            await updateScheduled(job.id, {
              status: "done",
              remoteUrl: uploaded.url,
            });
            await ingestAnalytics({
              platform: "youtube",
              projectId: job.projectId,
              postId: uploaded.id,
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              source: "oauth",
            });
            await pushNotification({
              kind: "publish",
              title: "Scheduled publish done",
              body: uploaded.url,
              projectId: job.projectId,
              href: uploaded.url,
            });
            results.push({ id: job.id, ok: true, url: uploaded.url });
          } else {
            // Social pack: mark due job ready with download + caption
            const caption =
              job.caption ||
              [job.title, job.description].filter(Boolean).join("\n\n");
            await updateScheduled(job.id, {
              status: "done",
              remoteUrl: downloadUrl,
              caption,
            });
            await ingestAnalytics({
              platform: job.platform,
              projectId: job.projectId,
              postId: names[0],
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              source: "manual",
            });
            await pushNotification({
              kind: "publish",
              title: `${job.platform} pack ready`,
              body: caption.slice(0, 180) || `${job.title} — download & post`,
              projectId: job.projectId,
              href: downloadUrl,
            });
            results.push({ id: job.id, ok: true, url: downloadUrl });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed";
          await updateScheduled(job.id, { status: "error", error: msg });
          await pushNotification({
            kind: "publish",
            title: "Scheduled publish failed",
            body: msg,
            projectId: job.projectId,
          });
          results.push({ id: job.id, ok: false, error: msg });
        }
      }
      return NextResponse.json({ processed: results.length, results });
    }

    // enqueue
    if (!body.projectId || !body.dueAt) {
      return NextResponse.json(
        { error: "projectId and dueAt required" },
        { status: 400 },
      );
    }
    const project = await getProject(body.projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const job = await enqueueScheduled({
      projectId: body.projectId,
      platform: body.platform || "youtube",
      title:
        body.title ||
        project.spec?.growthPack?.titles?.youtube?.[0] ||
        project.name ||
        "Scheduled clip",
      description:
        body.description ||
        buildYoutubeDescription(project.spec?.growthPack),
      caption: body.caption,
      dueAt: body.dueAt,
    });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Schedule failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
