import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import {
  applyCloudPull,
  createApproval,
  listApprovals,
  listCloudVersions,
  pushCloudProject,
  resolveApproval,
  restoreCloudVersion,
} from "@/lib/cloud-sync";
import type { TeamRole } from "@/lib/platform-types";

export const runtime = "nodejs";

function canSync(role?: TeamRole) {
  return !role || role === "admin" || role === "editor";
}
function canRequest(role?: TeamRole) {
  return !role || role === "admin" || role === "editor";
}
function canResolve(role?: TeamRole) {
  return !role || role === "admin" || role === "reviewer";
}

/** GET /api/cloud?projectId=&approvals=1 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || "";
    if (url.searchParams.get("approvals") === "1") {
      const items = await listApprovals(projectId || undefined);
      return NextResponse.json({ approvals: items });
    }
    if (url.searchParams.get("versions") === "1") {
      if (!projectId) {
        return NextResponse.json({ error: "projectId required" }, { status: 400 });
      }
      const versions = await listCloudVersions(projectId);
      return NextResponse.json({ versions });
    }
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const project = await getProject(projectId);
    return NextResponse.json({
      local: Boolean(project),
      updatedAt: project?.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloud status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/cloud
 * { action: "push"|"pull"|"approve"|"reject"|"request", projectId, role, ... }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      projectId?: string;
      deviceId?: string;
      approvalId?: string;
      title?: string;
      note?: string;
      author?: string;
      commentId?: string;
      resolvedBy?: string;
      role?: TeamRole;
      revision?: number;
    };

    const role = body.role;

    if (body.action === "push") {
      if (!canSync(role)) {
        return NextResponse.json(
          { error: "Reviewers cannot push — switch to Editor or Admin" },
          { status: 403 },
        );
      }
      if (!body.projectId) {
        return NextResponse.json({ error: "projectId required" }, { status: 400 });
      }
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const meta = await pushCloudProject(project, body.deviceId);
      return NextResponse.json({ meta, ok: true });
    }

    if (body.action === "pull") {
      if (!canSync(role)) {
        return NextResponse.json(
          { error: "Reviewers cannot pull — switch to Editor or Admin" },
          { status: 403 },
        );
      }
      if (!body.projectId) {
        return NextResponse.json({ error: "projectId required" }, { status: 400 });
      }
      const project = await applyCloudPull(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "No cloud snapshot" }, { status: 404 });
      }
      return NextResponse.json({ project, ok: true });
    }

    if (body.action === "restore") {
      if (!canSync(role)) {
        return NextResponse.json(
          { error: "Reviewers cannot restore — switch to Editor or Admin" },
          { status: 403 },
        );
      }
      if (!body.projectId || typeof body.revision !== "number") {
        return NextResponse.json(
          { error: "projectId and revision required" },
          { status: 400 },
        );
      }
      const project = await restoreCloudVersion(body.projectId, body.revision);
      if (!project) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      return NextResponse.json({ project, ok: true, revision: body.revision });
    }

    if (body.action === "request") {
      if (!canRequest(role)) {
        return NextResponse.json(
          { error: "Reviewers cannot request approval" },
          { status: 403 },
        );
      }
      if (!body.projectId) {
        return NextResponse.json({ error: "projectId required" }, { status: 400 });
      }
      const item = await createApproval({
        projectId: body.projectId,
        commentId: body.commentId,
        title: body.title || "Approval requested",
        note: body.note || "",
        author: body.author || "editor",
        authorRole: role || "editor",
      });
      return NextResponse.json({ approval: item });
    }

    if (body.action === "approve" || body.action === "reject") {
      if (!canResolve(role)) {
        return NextResponse.json(
          { error: "Editors cannot approve — switch to Reviewer or Admin" },
          { status: 403 },
        );
      }
      if (!body.approvalId) {
        return NextResponse.json({ error: "approvalId required" }, { status: 400 });
      }
      const item = await resolveApproval(
        body.approvalId,
        body.action === "approve" ? "approved" : "rejected",
        body.resolvedBy,
        role,
      );
      if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ approval: item });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloud action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
