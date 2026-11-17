// Local production start: the standalone server chdirs into .next/standalone,
// so resolve DATA_DIR against the repo root first. (Docker sets DATA_DIR=/data.)
import path from "node:path";
process.env.DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
await import("../.next/standalone/server.js");
