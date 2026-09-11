import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: light rate headers + optional token gate for /api/*.
 * Heavy token-bucket + SSRF still run in Node route handlers (apiGate).
 *
 * Set CLIPPERS_API_TOKEN to require Authorization: Bearer <token>
 * (or x-clippers-token) when exposing the app on a LAN.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const expected = process.env.CLIPPERS_API_TOKEN?.trim();
  if (expected && expected.length >= 8) {
    const auth = request.headers.get("authorization") || "";
    const bearer = /^Bearer\s+(\S+)/i.exec(auth)?.[1]?.trim();
    const hdr = request.headers.get("x-clippers-token")?.trim();
    const got = bearer || hdr;
    if (!got || got !== expected) {
      return NextResponse.json(
        { error: "Unauthorized — set Authorization: Bearer <CLIPPERS_API_TOKEN>" },
        { status: 401 },
      );
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
