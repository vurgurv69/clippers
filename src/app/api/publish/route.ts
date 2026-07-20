import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { exportsDir, getProject } from "@/lib/editor-project";
import {
  loadTokens,
  oauthConfigured,
  setYoutubeThumbnail,
  uploadYoutubeVideo,
} from "@/lib/oauth";
import type { PublishPlatform } from "@/lib/platform-types";
import { ingestAnalytics } from "@/lib/analytics-store";
import {
  buildYoutubeDescription,
  youtubeTagsFromPack,
} from "@/lib/youtube-publish-meta";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  projectId?: string;
  platform?: PublishPlatform;
  title?: string;
  description?: string;
  privacy?: "public" | "unlisted" | "private";
  /** Export filename under project exports/, or absolute-ish basename. */
  exportFile?: string;
  /** Optional thumbnail PNG/JPG basename under exports/ or absolute path under project. */
  thumbnailFile?: string;
  /** Public URL path like /api/editor/project/.../file/thumb.png — resolved to disk. */
  thumbnailUrl?: string;
};

/** POST /api/publish — upload latest export to a connected platform. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const platform = body.platform || "youtube";
    const project = await getProject(body.projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (platform === "youtube") {
      const tokens = await loadTokens(platform);
      if (!tokens) {
        return NextResponse.json(
          {
            error: `${platform} not connected`,
            connect: true,
            configured: oauthConfigured(platform),
          },
          { status: 401 },
        );
      }
    }

    const dir = exportsDir(body.projectId);
    let filePath = "";
    if (body.exportFile) {
      filePath = path.join(dir, path.basename(body.exportFile));
    } else {
      // newest export-* video
      try {
        const names = await fs.promises.readdir(dir);
        const vids = names
          .filter((n) => n.startsWith("export-") && /\.(mp4|mov|webm)$/i.test(n))
          .map((n) => ({
            n,
            m: fs.statSync(path.join(dir, n)).mtimeMs,
          }))
          .sort((a, b) => b.m - a.m);
        if (vids[0]) filePath = path.join(dir, vids[0].n);
      } catch {
        // ignore
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "No export found — render a video first" },
        { status: 400 },
      );
    }

    const ytTags = youtubeTagsFromPack(project.spec?.growthPack);
    const socialTags =
      project.spec?.growthPack?.hashtags?.[platform] ||
      project.spec?.growthPack?.hashtags?.tiktok ||
      [];
    const titlePick =
      platform === "tiktok"
        ? project.spec?.growthPack?.titles?.tiktok?.[0]
        : platform === "instagram"
          ? project.spec?.growthPack?.titles?.instagram?.[0]
          : platform === "linkedin"
            ? project.spec?.growthPack?.titles?.linkedin?.[0] ||
              project.spec?.growthPack?.titles?.youtube?.[0]
            : platform === "x"
              ? project.spec?.growthPack?.titles?.x?.[0] ||
                project.spec?.growthPack?.titles?.youtube?.[0]
              : project.spec?.growthPack?.titles?.youtube?.[0];
    const title =
      body.title ||
      titlePick ||
      project.name ||
      "Clippers export";
    const description =
      body.description ||
      (platform === "youtube"
        ? buildYoutubeDescription(project.spec?.growthPack)
        : project.spec?.growthPack?.description ||
          "Uploaded with Clippers Growth Hub");

    if (platform === "youtube") {
      const result = await uploadYoutubeVideo({
        filePath,
        title,
        description,
        privacy: body.privacy || "unlisted",
        tags: ytTags,
      });

      let thumbApplied = false;
      const thumbPath = resolveThumbPath(body.projectId, body);
      if (thumbPath && fs.existsSync(thumbPath)) {
        try {
          await setYoutubeThumbnail({ videoId: result.id, imagePath: thumbPath });
          thumbApplied = true;
        } catch {
          // thumbnail optional — video still published
        }
      }

      await ingestAnalytics({
        platform: "youtube",
        projectId: body.projectId,
        postId: result.id,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        source: "oauth",
      });

      return NextResponse.json({
        ok: true,
        platform,
        mode: "upload",
        remoteId: result.id,
        remoteUrl: result.url,
        title,
        thumbApplied,
      });
    }

    // Phase 7/8 — social publish pack until native OAuth upload ships
    const basename = path.basename(filePath);
    const downloadUrl = `/api/editor/project/${body.projectId}/file/${encodeURIComponent(basename)}`;
    const caption = [title, description, socialTags.join(" ")].filter(Boolean).join("\n\n");
    const openUrl =
      platform === "tiktok"
        ? "https://www.tiktok.com/upload?lang=en"
        : platform === "instagram"
          ? "https://www.instagram.com/"
          : platform === "linkedin"
            ? "https://www.linkedin.com/feed/"
            : platform === "x"
              ? "https://x.com/compose/post"
              : undefined;

    await ingestAnalytics({
      platform,
      projectId: body.projectId,
      postId: basename,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      source: "manual",
    });

    return NextResponse.json({
      ok: true,
      platform,
      mode: "pack",
      downloadUrl,
      caption,
      hashtags: socialTags,
      openUrl,
      title,
      message: `Download + caption pack ready for ${platform}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function resolveThumbPath(
  projectId: string,
  body: Body,
): string | null {
  const dir = exportsDir(projectId);
  if (body.thumbnailFile) {
    return path.join(dir, path.basename(body.thumbnailFile));
  }
  if (body.thumbnailUrl) {
    // /api/editor/project/:id/file/:name
    const m = body.thumbnailUrl.match(/\/file\/([^/?#]+)/);
    if (m) return path.join(dir, decodeURIComponent(m[1]));
  }
  return null;
}
