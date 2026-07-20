/**
 * Marketplace + cloud sync stores (Phase 3).
 */

import fs from "fs/promises";
import path from "path";
import type {
  ApprovalItem,
  CloudSyncMeta,
  CloudVersionEntry,
  MarketplacePack,
} from "./platform-types";
import type { Project } from "./editor-types";
import { getProject, saveProject } from "./editor-project";

const DATA_ROOT = path.join(process.cwd(), ".data");

function marketplaceDir() {
  return path.join(DATA_ROOT, "marketplace");
}

function cloudDir() {
  return path.join(DATA_ROOT, "cloud");
}

function cloudVersionsDir(projectId: string) {
  return path.join(cloudDir(), projectId, "versions");
}

function approvalsPath() {
  return path.join(DATA_ROOT, "approvals.json");
}

export async function listMarketplacePacks(): Promise<MarketplacePack[]> {
  try {
    await fs.mkdir(marketplaceDir(), { recursive: true });
    const names = await fs.readdir(marketplaceDir());
    const out: MarketplacePack[] = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(marketplaceDir(), n), "utf8");
        out.push(JSON.parse(raw) as MarketplacePack);
      } catch {
        // skip
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  } catch {
    return [];
  }
}

export async function pushMarketplacePack(
  pack: Omit<MarketplacePack, "syncedAt">,
): Promise<MarketplacePack> {
  await fs.mkdir(marketplaceDir(), { recursive: true });
  const full: MarketplacePack = {
    ...pack,
    syncedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(marketplaceDir(), `${pack.id}.json`),
    JSON.stringify(full, null, 2),
    "utf8",
  );
  return full;
}

export async function pullMarketplacePack(
  id: string,
): Promise<MarketplacePack | null> {
  try {
    const raw = await fs.readFile(
      path.join(marketplaceDir(), `${id}.json`),
      "utf8",
    );
    return JSON.parse(raw) as MarketplacePack;
  } catch {
    return null;
  }
}

export async function pushCloudProject(
  project: Project,
  deviceId?: string,
): Promise<CloudSyncMeta> {
  await fs.mkdir(cloudDir(), { recursive: true });
  const metaPath = path.join(cloudDir(), `${project.id}.meta.json`);
  let revision = 1;
  try {
    const prev = JSON.parse(await fs.readFile(metaPath, "utf8")) as CloudSyncMeta;
    revision = (prev.revision || 0) + 1;
  } catch {
    // first
  }
  const meta: CloudSyncMeta = {
    projectId: project.id,
    revision,
    syncedAt: new Date().toISOString(),
    deviceId,
  };
  const snapshotPath = path.join(cloudDir(), `${project.id}.json`);
  await fs.writeFile(snapshotPath, JSON.stringify(project, null, 2), "utf8");
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  // Archive revision for version history (Phase 14)
  const versionsDir = cloudVersionsDir(project.id);
  await fs.mkdir(versionsDir, { recursive: true });
  await fs.writeFile(
    path.join(versionsDir, `rev-${revision}.json`),
    JSON.stringify(project, null, 2),
    "utf8",
  );
  return meta;
}

export async function listCloudVersions(projectId: string): Promise<CloudVersionEntry[]> {
  try {
    const dir = cloudVersionsDir(projectId);
    const names = await fs.readdir(dir);
    const out: CloudVersionEntry[] = [];
    for (const n of names) {
      const m = /^rev-(\d+)\.json$/.exec(n);
      if (!m) continue;
      const revision = Number(m[1]);
      let syncedAt = "";
      let deviceId: string | undefined;
      let name: string | undefined;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as Project;
        syncedAt = raw.updatedAt || "";
        name = raw.name;
      } catch {
        // ignore parse errors
      }
      try {
        const stat = await fs.stat(path.join(dir, n));
        if (!syncedAt) syncedAt = stat.mtime.toISOString();
      } catch {
        // ignore
      }
      out.push({ revision, syncedAt, deviceId, name });
    }
    out.sort((a, b) => b.revision - a.revision);
    return out;
  } catch {
    return [];
  }
}

export async function restoreCloudVersion(
  projectId: string,
  revision: number,
): Promise<Project | null> {
  try {
    const raw = await fs.readFile(
      path.join(cloudVersionsDir(projectId), `rev-${revision}.json`),
      "utf8",
    );
    const project = JSON.parse(raw) as Project;
    await saveProject(project);
    // Update cloud head to restored snapshot
    await fs.writeFile(
      path.join(cloudDir(), `${projectId}.json`),
      JSON.stringify(project, null, 2),
      "utf8",
    );
    const metaPath = path.join(cloudDir(), `${projectId}.meta.json`);
    let meta: CloudSyncMeta = {
      projectId,
      revision,
      syncedAt: new Date().toISOString(),
    };
    try {
      const prev = JSON.parse(await fs.readFile(metaPath, "utf8")) as CloudSyncMeta;
      meta = { ...prev, revision, syncedAt: new Date().toISOString() };
    } catch {
      // first meta
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    return project;
  } catch {
    return null;
  }
}

export async function pullCloudProject(
  projectId: string,
): Promise<{ project: Project; meta: CloudSyncMeta } | null> {
  try {
    const project = JSON.parse(
      await fs.readFile(path.join(cloudDir(), `${projectId}.json`), "utf8"),
    ) as Project;
    const meta = JSON.parse(
      await fs.readFile(path.join(cloudDir(), `${projectId}.meta.json`), "utf8"),
    ) as CloudSyncMeta;
    return { project, meta };
  } catch {
    return null;
  }
}

/** Merge cloud snapshot into local project (spec + assets meta only). */
export async function applyCloudPull(projectId: string): Promise<Project | null> {
  const remote = await pullCloudProject(projectId);
  if (!remote) return null;
  const local = await getProject(projectId);
  if (!local) {
    // recreate from cloud
    await saveProject(remote.project);
    return remote.project;
  }
  local.spec = remote.project.spec || local.spec;
  local.name = remote.project.name || local.name;
  local.comments = remote.project.comments || local.comments;
  local.shareToken = remote.project.shareToken || local.shareToken;
  await saveProject(local);
  return local;
}

async function readApprovals(): Promise<ApprovalItem[]> {
  try {
    return JSON.parse(await fs.readFile(approvalsPath(), "utf8")) as ApprovalItem[];
  } catch {
    return [];
  }
}

async function writeApprovals(items: ApprovalItem[]) {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(approvalsPath(), JSON.stringify(items, null, 2), "utf8");
}

export async function listApprovals(projectId?: string): Promise<ApprovalItem[]> {
  const all = await readApprovals();
  if (!projectId) return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return all
    .filter((a) => a.projectId === projectId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createApproval(
  item: Omit<ApprovalItem, "id" | "createdAt" | "status"> & {
    status?: ApprovalItem["status"];
  },
): Promise<ApprovalItem> {
  const entry: ApprovalItem = {
    id: crypto.randomUUID(),
    projectId: item.projectId,
    commentId: item.commentId,
    title: item.title,
    note: item.note,
    author: item.author,
    authorRole: item.authorRole,
    status: item.status || "pending",
    createdAt: new Date().toISOString(),
  };
  const all = await readApprovals();
  all.push(entry);
  await writeApprovals(all);
  try {
    const { pushNotification } = await import("./publish-queue");
    await pushNotification({
      kind: "approval",
      title: "Approval requested",
      body: `${entry.title} — ${entry.author}`,
      projectId: entry.projectId,
    });
  } catch {
    // ignore
  }
  return entry;
}

export async function resolveApproval(
  id: string,
  status: "approved" | "rejected",
  resolvedBy?: string,
  resolvedByRole?: ApprovalItem["authorRole"],
): Promise<ApprovalItem | null> {
  const all = await readApprovals();
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status,
    resolvedAt: new Date().toISOString(),
    resolvedBy: resolvedBy || "editor",
    resolvedByRole,
  };
  await writeApprovals(all);
  return all[idx];
}
