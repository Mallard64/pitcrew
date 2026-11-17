import { describe, expect, it } from "vitest";
import { checkPublicUrl, isPrivateIp, makeRequestGuard } from "../src/lib/ssrf";

const fakeDns = async (host: string) => {
  const table: Record<string, string[]> = {
    "example.com": ["93.184.215.14"],
    "evil.test": ["10.1.2.3"],
    "rebind.test": ["93.184.215.14", "127.0.0.1"],
    "v6.test": ["2606:4700::6810:84e5"],
  };
  if (!table[host]) throw new Error("ENOTFOUND");
  return table[host];
};

describe("SSRF guard", () => {
  it.each([
    ["https://example.com/app", true],
    ["https://v6.test", true],
    ["http://localhost:3000", false],
    ["http://localhost", false],
    ["http://127.0.0.1", false],
    ["http://10.0.0.1", false],
    ["http://192.168.1.1", false],
    ["http://172.20.0.5", false],
    ["http://169.254.169.254/latest/meta-data", false],
    ["http://[::1]", false],
    ["http://[fd00::1]", false],
    ["http://[::ffff:127.0.0.1]", false],
    ["http://evil.test", false],
    ["http://rebind.test", false],
    ["https://example.com:8443", false],
    ["ftp://example.com", false],
    ["https://user:pw@example.com", false],
    ["https://nope.test", false],
    ["not a url", false],
  ])("%s → %s", async (url, ok) => {
    expect((await checkPublicUrl(url, fakeDns)).ok).toBe(ok);
  });

  it("classifies IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  it("request guard caches per host and allows data: URLs", async () => {
    const guard = makeRequestGuard(fakeDns);
    expect(await guard("https://example.com/a.js")).toBe(true);
    expect(await guard("http://evil.test/x")).toBe(false);
    expect(await guard("data:image/png;base64,AAA")).toBe(true);
  });
});
