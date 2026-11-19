# Pit Crew: Next.js app + Chromium (Playwright) + ffmpeg in one image.
# The Playwright base image ships Chromium, its system deps and fonts; the tag must match package.json.
FROM mcr.microsoft.com/playwright:v1.65.1-noble AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Bundle the Remotion project once here, not at the start of every job.
RUN npx tsx scripts/bundle-remotion.ts /app/remotion-bundle

FROM base AS run
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/.next/standalone ./
# Remotion loads native packages at runtime (@rspack/binding-*, esbuild, compositor) that output tracing misses;
# ship the full node_modules from the deps stage over the traced subset.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/remotion-bundle ./remotion-bundle
# The sandbox recorder is sent to the HarnessRouter sandbox as text (it never runs here).
COPY --from=build /app/harness/sandbox ./harness/sandbox
ENV REMOTION_BUNDLE=/app/remotion-bundle
RUN mkdir -p /data
# Persistent storage: attach a Railway volume at /data (Railway rejects the Dockerfile VOLUME keyword).
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
