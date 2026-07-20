import fs from "fs/promises";
import path from "path";
import type { AspectRatio } from "./types";
import type { Project, ProjectAsset, ProjectSpec } from "./editor-types";

const DATA_ROOT = path.join(process.cwd(), ".data");

export function projectsRoot() {
  return path.join(DATA_ROOT, "projects");
}

export function projectDir(id: string) {
  return path.join(projectsRoot(), id);
}

export function assetsDir(id: string) {
  return path.join(projectDir(id), "assets");
}

export function workDir(id: string) {
  return path.join(projectDir(id), "work");
}

/** Cache for generated thumbnails / waveforms. */
export function cacheDir(id: string) {
  return path.join(projectDir(id), "cache");
}

export function exportsDir(id: string) {
  return path.join(projectDir(id), "exports");
}

function projectJsonPath(id: string) {
  return path.join(projectDir(id), "project.json");
}

export async function createProject(aspect: AspectRatio): Promise<Project> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const project: Project = {
    id,
    aspect,
    assets: [],
    createdAt: now,
    updatedAt: now,
  };
  await fs.mkdir(assetsDir(id), { recursive: true });
  await fs.mkdir(workDir(id), { recursive: true });
  await fs.mkdir(exportsDir(id), { recursive: true });
  await saveProject(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(projectJsonPath(id), "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  await fs.writeFile(
    projectJsonPath(project.id),
    JSON.stringify(project, null, 2),
    "utf8",
  );
}

export async function addAsset(id: string, asset: ProjectAsset): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  project.assets.push(asset);
  await saveProject(project);
  return project;
}

/** Persist the editable timeline state (clips / text / music) for recovery. */
export async function saveSpec(
  id: string,
  spec: ProjectSpec,
  name?: string,
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  project.spec = spec;
  if (spec.aspect) project.aspect = spec.aspect;
  if (typeof name === "string") project.name = name;
  await saveProject(project);
  return project;
}

/** Attach or clear a proxy filename on an asset. */
export async function setAssetProxy(
  id: string,
  assetId: string,
  proxyFile: string | null,
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("Asset not found");
  if (proxyFile) asset.proxyFile = proxyFile;
  else delete asset.proxyFile;
  await saveProject(project);
  return project;
}

/** Rename an asset's display name (file on disk stays the same). */
export async function renameAsset(
  id: string,
  assetId: string,
  name: string,
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("Asset not found");
  asset.name = name.trim() || asset.name;
  await saveProject(project);
  return project;
}

/** Delete one asset and its file. Does not rewrite the timeline. */
export async function deleteAsset(
  id: string,
  assetId: string,
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("Asset not found");
  project.assets = project.assets.filter((a) => a.id !== assetId);
  await saveProject(project);
  try {
    await fs.unlink(path.join(assetsDir(id), asset.filename));
  } catch {
    // ignore missing file
  }
  return project;
}

/** Remove assets not referenced by clips / music / musicTracks / LUT filenames. */
export async function deleteUnusedAssets(id: string): Promise<{
  project: Project;
  removed: number;
}> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const used = new Set<string>();
  const spec = project.spec;
  if (spec) {
    for (const c of spec.clips || []) {
      used.add(c.assetId);
      if (c.color?.lut) used.add(c.color.lut);
    }
    if (spec.music) used.add(spec.music.assetId);
    for (const m of spec.musicTracks || []) used.add(m.assetId);
    for (const t of spec.texts || []) {
      if (t.fontFile) used.add(t.fontFile);
    }
  }
  const keep: typeof project.assets = [];
  let removed = 0;
  for (const a of project.assets) {
    if (used.has(a.id) || used.has(a.filename)) {
      keep.push(a);
      continue;
    }
    removed++;
    try {
      await fs.unlink(path.join(assetsDir(id), a.filename));
    } catch {
      // ignore
    }
  }
  project.assets = keep;
  await saveProject(project);
  return { project, removed };
}

/** Point an existing asset id at a newly uploaded file (same kind). */
export async function replaceAssetFile(
  id: string,
  assetId: string,
  next: { filename: string; name: string; width?: number; height?: number; duration: number; hasAudio: boolean },
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("Asset not found");
  const oldName = asset.filename;
  asset.filename = next.filename;
  asset.name = next.name;
  asset.width = next.width;
  asset.height = next.height;
  asset.duration = next.duration;
  asset.hasAudio = next.hasAudio;
  await saveProject(project);
  if (oldName !== next.filename) {
    try {
      await fs.unlink(path.join(assetsDir(id), oldName));
    } catch {
      // ignore
    }
  }
  return project;
}

/** List recent projects (newest first). */
export async function listProjects(): Promise<Project[]> {
  try {
    await fs.mkdir(projectsRoot(), { recursive: true });
    const ids = await fs.readdir(projectsRoot());
    const out: Project[] = [];
    for (const id of ids) {
      const p = await getProject(id);
      if (p) out.push(p);
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  } catch {
    return [];
  }
}

/** Find a project by public share token. */
export async function getProjectByShareToken(
  token: string,
): Promise<Project | null> {
  if (!token?.trim()) return null;
  const all = await listProjects();
  return all.find((p) => p.shareToken === token) || null;
}

/** Ensure a share token exists and persist it. */
export async function ensureShareToken(id: string): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  if (!project.shareToken) {
    project.shareToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await saveProject(project);
  }
  return project;
}

/** Append a review comment. */
export async function addReviewComment(
  id: string,
  comment: {
    t: number;
    text: string;
    author: string;
  },
): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error("Project not found");
  const entry = {
    id: crypto.randomUUID(),
    t: Math.max(0, comment.t),
    text: comment.text.trim().slice(0, 500),
    author: (comment.author || "Reviewer").trim().slice(0, 40),
    createdAt: new Date().toISOString(),
  };
  project.comments = [...(project.comments || []), entry];
  await saveProject(project);
  return project;
}

/** Newest rendered export under exports/, or null. */
export async function latestExportFile(
  projectId: string,
): Promise<{ filename: string; mtimeMs: number } | null> {
  try {
    const dir = exportsDir(projectId);
    const names = await fs.readdir(dir);
    const vids = await Promise.all(
      names
        .filter((n) => n.startsWith("export-") && /\.(mp4|mov|webm)$/i.test(n))
        .map(async (n) => {
          const st = await fs.stat(path.join(dir, n));
          return { filename: n, mtimeMs: st.mtimeMs };
        }),
    );
    vids.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return vids[0] || null;
  } catch {
    return null;
  }
}
