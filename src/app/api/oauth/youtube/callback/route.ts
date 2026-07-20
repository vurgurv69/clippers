import { NextResponse } from "next/server";
import { exchangeYoutubeCode } from "@/lib/oauth";

export const runtime = "nodejs";

/** GET /api/oauth/youtube/callback?code=&state= */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(
      new URL(`/?oauth=error&platform=youtube&msg=${encodeURIComponent(err)}`, url.origin),
    );
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  try {
    await exchangeYoutubeCode(code, request.url);
    return NextResponse.redirect(
      new URL("/?oauth=success&platform=youtube#studio", url.origin),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth failed";
    return NextResponse.redirect(
      new URL(
        `/?oauth=error&platform=youtube&msg=${encodeURIComponent(msg.slice(0, 120))}`,
        url.origin,
      ),
    );
  }
}
