import dns from "dns/promises";
import net from "net";

export class UrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return -1;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/** True if address is loopback, private, link-local, or otherwise non-routable. */
export function isBlockedIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(v) === 4) {
    const n = ipv4ToInt(v);
    if (n < 0) return true;
    // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 224+/multicast
    if ((n >>> 24) === 0) return true;
    if ((n >>> 24) === 10) return true;
    if ((n >>> 24) === 127) return true;
    if ((n >>> 16) === 0xa9fe) return true; // 169.254
    if ((n >>> 16) === 0xc0a8) return true; // 192.168
    const b = n >>> 20;
    if (b === 0xac1) return true; // 172.16–172.31
    if ((n >>> 22) === 0x191) return true; // 100.64–100.127 CGNAT
    if ((n >>> 24) >= 224) return true;
    return false;
  }
  if (net.isIP(v) === 6) {
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA
    if (v.startsWith("fe80")) return true; // link-local
    if (v.startsWith("ff")) return true; // multicast
    // IPv4-mapped
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);
    if (m) return isBlockedIp(m[1]);
    return false;
  }
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

/**
 * Validate user-submitted media URLs before yt-dlp / Cobalt / curl.
 * Blocks non-http(s), credentials-in-URL, and private/reserved hosts (SSRF).
 */
export async function assertSafeMediaUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new UrlSafetyError("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlSafetyError("Only http(s) video links are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new UrlSafetyError("URLs with embedded credentials are blocked.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new UrlSafetyError("That host is blocked for security.");
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      throw new UrlSafetyError("Private or local network addresses are blocked.");
    }
    return parsed;
  }
  // Resolve DNS and reject if any A/AAAA is private (DNS rebinding defense).
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records.length) {
      throw new UrlSafetyError("Could not resolve that host.");
    }
    for (const r of records) {
      if (isBlockedIp(r.address)) {
        throw new UrlSafetyError("That host resolves to a private address and is blocked.");
      }
    }
  } catch (err) {
    if (err instanceof UrlSafetyError) throw err;
    throw new UrlSafetyError("Could not resolve that host.");
  }
  return parsed;
}
