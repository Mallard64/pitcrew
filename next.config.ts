import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native / binary-heavy deps must not be bundled.
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core"],
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
