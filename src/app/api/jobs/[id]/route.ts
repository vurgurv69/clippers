import { NextResponse } from "next/server";
import { apiGate } from "@/lib/api-gate";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const gated = apiGate(request, {
    bucket: "jobs-id-poll",
    capacity: 90,
    refillPerSec: 3,
  });
  if (gated) return gated;

  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
