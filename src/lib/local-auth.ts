/**
 * Optional local auth for network-exposed / multi-user setups.
 * Set CLIPPERS_API_TOKEN in the environment to require
 * `Authorization: Bearer <token>` or `x-clippers-token: <token>` on API routes.
 */

export function expectedApiToken(): string | null {
  const t = process.env.CLIPPERS_API_TOKEN?.trim();
  return t && t.length >= 8 ? t : null;
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  if (m?.[1]) return m[1].trim();
  const hdr = request.headers.get("x-clippers-token")?.trim();
  return hdr || null;
}

export function assertLocalAuth(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = expectedApiToken();
  if (!expected) return { ok: true };
  const got = extractBearerToken(request);
  if (!got || got !== expected) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized — set Authorization: Bearer <CLIPPERS_API_TOKEN>",
    };
  }
  return { ok: true };
}
