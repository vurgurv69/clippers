/**
 * Scheduled publish queue + notifications (Phase 4).
 */

import fs from "fs/promises";
import path from "path";
import type { PublishPlatform } from "./platform-types";

const DATA_ROOT = path.join(process.cwd(), ".data");
const QUEUE_FILE = path.join(DATA_ROOT, "publish-queue.json");
const NOTIF_FILE = path.join(DATA_ROOT, "notifications.json");

export type ScheduledPublish = {
  id: string;
  projectId: string;
  platform: PublishPlatform;
  title: string;
  description?: string;
  /** Caption pack text for non-YT platforms (Phase 9). */
  caption?: string;
  dueAt: string;
  status: "scheduled" | "publishing" | "done" | "error" | "cancelled";
  remoteUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppNotification = {
  id: string;
  kind: "approval" | "publish" | "analytics" | "system";
  title: string;
  body: string;
  href?: string;
  projectId?: string;
  read: boolean;
  createdAt: string;
};

async function readQueue(): Promise<ScheduledPublish[]> {
  try {
    return JSON.parse(await fs.readFile(QUEUE_FILE, "utf8")) as ScheduledPublish[];
  } catch {
    return [];
  }
}

async function writeQueue(items: ScheduledPublish[]) {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function listScheduled(projectId?: string): Promise<ScheduledPublish[]> {
  const all = await readQueue();
  const filtered = projectId ? all.filter((j) => j.projectId === projectId) : all;
  return filtered.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
}

export async function enqueueScheduled(
  partial: Omit<ScheduledPublish, "id" | "status" | "createdAt" | "updatedAt">,
): Promise<ScheduledPublish> {
  const job: ScheduledPublish = {
    ...partial,
    id: crypto.randomUUID(),
    status: "scheduled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const all = await readQueue();
  all.push(job);
  await writeQueue(all);
  await pushNotification({
    kind: "publish",
    title: "Publish scheduled",
    body: `${job.platform} · ${job.title} at ${new Date(job.dueAt).toLocaleString()}`,
    projectId: job.projectId,
  });
  return job;
}

export async function cancelScheduled(id: string): Promise<boolean> {
  const all = await readQueue();
  const idx = all.findIndex((j) => j.id === id);
  if (idx < 0) return false;
  all[idx] = {
    ...all[idx],
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  };
  await writeQueue(all);
  return true;
}

export async function updateScheduled(
  id: string,
  patch: Partial<ScheduledPublish>,
): Promise<ScheduledPublish | null> {
  const all = await readQueue();
  const idx = all.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  await writeQueue(all);
  return all[idx];
}

/** Jobs due now (scheduled and dueAt <= now). */
export async function dueScheduled(now = Date.now()): Promise<ScheduledPublish[]> {
  const all = await readQueue();
  return all.filter(
    (j) => j.status === "scheduled" && new Date(j.dueAt).getTime() <= now,
  );
}

async function readNotifs(): Promise<AppNotification[]> {
  try {
    return JSON.parse(await fs.readFile(NOTIF_FILE, "utf8")) as AppNotification[];
  } catch {
    return [];
  }
}

async function writeNotifs(items: AppNotification[]) {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(NOTIF_FILE, JSON.stringify(items.slice(-200), null, 2), "utf8");
}

export async function pushNotification(
  partial: Omit<AppNotification, "id" | "read" | "createdAt">,
): Promise<AppNotification> {
  const n: AppNotification = {
    id: crypto.randomUUID(),
    kind: partial.kind,
    title: partial.title,
    body: partial.body,
    href: partial.href,
    projectId: partial.projectId,
    read: false,
    createdAt: new Date().toISOString(),
  };
  const all = await readNotifs();
  all.push(n);
  await writeNotifs(all);
  return n;
}

export async function listNotifications(opts?: {
  unreadOnly?: boolean;
  projectId?: string;
}): Promise<AppNotification[]> {
  let all = await readNotifs();
  if (opts?.unreadOnly) all = all.filter((n) => !n.read);
  if (opts?.projectId) all = all.filter((n) => !n.projectId || n.projectId === opts.projectId);
  return all.reverse();
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const all = await readNotifs();
  let n = 0;
  for (const item of all) {
    if (!ids || ids.includes(item.id)) {
      if (!item.read) n++;
      item.read = true;
    }
  }
  await writeNotifs(all);
  return n;
}
