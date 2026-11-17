export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (message: string, status = 400) => json({ error: message }, status);

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fd = await req.formData().catch(() => null);
  return fd ? Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])) : {};
}
