/**
 * Analytics store + ingest (Phase 3).
 */

import fs from "fs/promises";
import path from "path";
import type { AnalyticsEvent, AnalyticsSummary } from "./platform-types";

const DATA_ROOT = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_ROOT, "analytics", "events.json");

async function readAll(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as AnalyticsEvent[];
  } catch {
    return [];
  }
}

async function writeAll(events: AnalyticsEvent[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(events.slice(-2000), null, 2), "utf8");
}

export async function ingestAnalytics(
  partial: Omit<AnalyticsEvent, "id" | "recordedAt" | "source"> & {
    source?: AnalyticsEvent["source"];
    recordedAt?: string;
  },
): Promise<AnalyticsEvent> {
  const event: AnalyticsEvent = {
    id: crypto.randomUUID(),
    platform: partial.platform,
    projectId: partial.projectId,
    postId: partial.postId,
    views: Math.max(0, Number(partial.views) || 0),
    likes: Math.max(0, Number(partial.likes) || 0),
    comments: Math.max(0, Number(partial.comments) || 0),
    shares: Math.max(0, Number(partial.shares) || 0),
    watchTimeSec: partial.watchTimeSec,
    retentionPct: partial.retentionPct,
    recordedAt: partial.recordedAt || new Date().toISOString(),
    source: partial.source || "ingest",
  };
  const all = await readAll();
  all.push(event);
  await writeAll(all);
  return event;
}

export async function summarizeAnalytics(
  projectId?: string,
): Promise<AnalyticsSummary> {
  let events = await readAll();
  if (projectId) {
    events = events.filter((e) => !e.projectId || e.projectId === projectId);
  }
  const byPlatform: AnalyticsSummary["byPlatform"] = {};
  let views = 0;
  let likes = 0;
  let comments = 0;
  let shares = 0;
  let retentionSum = 0;
  let retentionN = 0;
  for (const e of events) {
    views += e.views;
    likes += e.likes;
    comments += e.comments;
    shares += e.shares;
    if (typeof e.retentionPct === "number" && e.retentionPct > 0) {
      retentionSum += e.retentionPct;
      retentionN += 1;
    }
    const key = String(e.platform);
    if (!byPlatform[key]) {
      byPlatform[key] = { views: 0, likes: 0, comments: 0, shares: 0 };
    }
    byPlatform[key].views += e.views;
    byPlatform[key].likes += e.likes;
    byPlatform[key].comments += e.comments;
    byPlatform[key].shares += e.shares;
  }
  return {
    views,
    likes,
    comments,
    shares,
    avgRetentionPct: retentionN ? Math.round(retentionSum / retentionN) : undefined,
    byPlatform,
    recent: events.slice(-30).reverse(),
  };
}
