import { NextResponse } from "next/server";
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/publish-queue";

export const runtime = "nodejs";

/** GET /api/notifications?unread=1&projectId= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const items = await listNotifications({
      unreadOnly: url.searchParams.get("unread") === "1",
      projectId: url.searchParams.get("projectId") || undefined,
    });
    return NextResponse.json({
      notifications: items,
      unread: items.filter((n) => !n.read).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "List failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/notifications { action: "read", ids?: string[] } */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; ids?: string[] };
    if (body.action === "read") {
      const n = await markNotificationsRead(body.ids);
      return NextResponse.json({ marked: n });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
