/** Blocks URLs that point at private, loopback, link-local or metadata addresses (SSRF guard). */
import dns from "node:dns/promises";
import net from "node:net";

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // WHATWG URL normalises ::ffff:127.0.0.1 to hex form (::ffff:7f00:1).
    const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:");
  }
  return true; // not an IP at all: treat as unsafe
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

// Integration tests serve a fixture site on 127.0.0.1; only honoured under vitest (NODE_ENV=test).
const allowLocalForTests = () => process.env.NODE_ENV === "test" && process.env.PITCREW_TEST_ALLOW_LOCAL === "1";

export async function checkPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<UrlCheck> {
  if (allowLocalForTests()) return { ok: true, url: new URL(raw) };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "only http(s) URLs are allowed" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are not allowed" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "only ports 80 and 443 are allowed" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    return { ok: false, reason: "private hosts are not allowed" };
  let ips: string[];
  if (net.isIP(host)) ips = [host];
  else {
    try {
      ips = await resolve(host);
    } catch {
      return { ok: false, reason: "could not resolve host" };
    }
  }
  if (!ips.length || ips.some(isPrivateIp)) return { ok: false, reason: "this address points to a private network" };
  return { ok: true, url };
}

/** Request filter for Playwright: checks each new host once. Non-http(s) schemes (data:, blob:) pass. */
export function makeRequestGuard(resolve: Resolver = defaultResolver) {
  const cache = new Map<string, Promise<boolean>>();
  return (raw: string): Promise<boolean> => {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return Promise.resolve(false);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return Promise.resolve(u.protocol === "data:" || u.protocol === "blob:");
    const key = `${u.protocol}//${u.host}`;
    if (!cache.has(key)) cache.set(key, checkPublicUrl(key, resolve).then((r) => r.ok));
    return cache.get(key)!;
  };
}
