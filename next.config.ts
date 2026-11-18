import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native / binary-heavy deps must not be bundled.
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core", "@remotion/bundler", "@remotion/renderer", "remotion", "@remotion/transitions"],
  // Playwright reads data files (browsers.json, etc.) at runtime that tracing misses.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/playwright/**/*",
      // The Remotion project is bundled with webpack at runtime, so its sources and deps must ship.
      "./remotion/**/*",
      "./harness/**/*",
      "./node_modules/remotion/**/*",
      "./node_modules/@remotion/**/*",
    ],
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
