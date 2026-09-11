/**
 * Shared API gate: optional auth + token-bucket rate limits.
 * Call at the top of heavy route handlers.
 */
import { NextResponse } from "next/server";
import { assertLocalAuth } from "@/lib/local-auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export type GateOpts = {
  /** Bucket suffix, e.g. "jobs-post" | "export" | "poll". */
  bucket: string;
  capacity: number;
  refillPerSec: number;
  cost?: number;
};

export function apiGate(
  request: Request,
  opts: GateOpts,
): NextResponse | null {
  const auth = assertLocalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const rl = rateLimit({
    key: clientKey(request, opts.bucket),
    capacity: opts.capacity,
    refillPerSec: opts.refillPerSec,
    cost: opts.cost,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests — slow down and retry." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null;
}
