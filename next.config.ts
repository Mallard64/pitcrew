import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native / binary-heavy deps must not be bundled.
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core"],
  // Playwright reads data files (browsers.json, etc.) at runtime that tracing misses.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/playwright-core/**/*", "./node_modules/playwright/**/*"],
  },
  // Keep local job data and scratch files out of the standalone bundle.
  outputFileTracingExcludes: {
    "/**": ["./data/**/*", "./tmp/**/*", "./tests/**/*", "./eval/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
