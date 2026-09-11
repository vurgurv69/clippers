import { NextResponse } from "next/server";
import { hasOpenAiKey, llmStatus } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET() {
  const status = llmStatus();
  return NextResponse.json({
    ok: true,
    hasOpenAi: status.hasOpenAi,
    hasOpenAiKey: hasOpenAiKey(),
  });
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    hasOpenAi: hasOpenAiKey(),
    message: "No settings to update.",
  });
}
