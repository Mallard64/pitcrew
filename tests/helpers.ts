import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function serveDir(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent((req.url ?? "/").split("?")[0]));
    const file = p.endsWith("/") ? path.join(p, "index.html") : p;
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    }),
  );
}

export const tmpDir = (prefix = "pc-") => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
