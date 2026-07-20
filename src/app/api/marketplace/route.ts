import { NextResponse } from "next/server";
import {
  listMarketplacePacks,
  pullMarketplacePack,
  pushMarketplacePack,
} from "@/lib/cloud-sync";
import type { MarketplacePack } from "@/lib/platform-types";

export const runtime = "nodejs";

/** GET /api/marketplace — list synced packs. */
export async function GET() {
  try {
    const packs = await listMarketplacePacks();
    return NextResponse.json({ packs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "List failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/marketplace — push or pull.
 * { action: "push", pack } | { action: "pull", id }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "push" | "pull";
      id?: string;
      pack?: MarketplacePack;
    };
    if (body.action === "pull") {
      if (!body.id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const pack = await pullMarketplacePack(body.id);
      if (!pack) {
        return NextResponse.json({ error: "Pack not found" }, { status: 404 });
      }
      return NextResponse.json({ pack });
    }

    // push
    if (!body.pack?.id || !body.pack?.label) {
      return NextResponse.json({ error: "pack.id and pack.label required" }, { status: 400 });
    }
    const pack = await pushMarketplacePack({
      ...body.pack,
      updatedAt: body.pack.updatedAt || new Date().toISOString(),
      textPresets: body.pack.textPresets || [],
    });
    return NextResponse.json({ pack });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
