/**
 * Read-only facts about a public GitHub repo for projects without a live link: file tree, README,
 * manifests (stack), README images, key files, and public signals (stars, contributors, releases).
 * Never clones or executes repo code on our server: everything comes from the GitHub API (~5 calls)
 * and raw.githubusercontent.com.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseGithubRepo } from "./buildlog";
import { ffmpeg } from "../../harness/scripts/ff";
import type { VideoPlan } from "../../harness/schemas/video_plan";

export type RepoKind =
  | "web"
  | "python-web"
  | "python"
  | "cli"
  | "game-unity"
  | "game-unreal"
  | "game-godot"
  | "ios"
  | "other";

export type RepoFacts = {
  url: string;
  owner: string;
  repo: string;
  branch: string;
  description: string;
  homepage: string;
  stars: number;
  forks: number;
  contributors: number;
  releases: { tag: string; downloads: number }[];
  openIssues: string[];
  tree: string[];
  readme: { path: string; text: string };
  manifests: Record<string, string>;
  stack: string[];
  kind: RepoKind;
  /** README / docs images we can show (repo-relative paths). */
  images: { path: string; alt: string }[];
  /** A browser-playable build linked from the README or homepage (itch.io, WebGL), if any. */
  playableUrl?: string;
  fetchedAt: string;
};

const MANIFESTS =
  /^(package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|Dockerfile|Makefile|project\.godot|ProjectSettings\/ProjectVersion\.txt|Packages\/manifest\.json|[^/]+\.uproject|[^/]+\.csproj|backend\/requirements\.txt|backend\/pyproject\.toml|backend\/Dockerfile)$/;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

function headers() {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "pit-crew",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJson<T>(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ body: T | null; res: Response | null }> {
  try {
    const res = await fetchImpl(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
    return { body: res.ok ? ((await res.json()) as T) : null, res };
  } catch {
    return { body: null, res: null };
  }
}

export const rawUrl = (f: Pick<RepoFacts, "owner" | "repo" | "branch">, p: string) =>
  `https://raw.githubusercontent.com/${f.owner}/${f.repo}/${encodeURIComponent(f.branch)}/${p.split("/").map(encodeURIComponent).join("/")}`;

async function getText(url: string, fetchImpl: typeof fetch, max = 20000) {
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "pit-crew" },
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? (await res.text()).slice(0, max) : "";
  } catch {
    return "";
  }
}

/** What kind of project this is, from the files present (no code is run). */
export function detectKind(
  tree: string[],
  manifests: Record<string, string>,
): { kind: RepoKind; stack: string[] } {
  const has = (re: RegExp) => tree.some((p) => re.test(p));
  const stack: string[] = [];
  const pkg = manifests["package.json"] ?? "";
  const py = [
    manifests["requirements.txt"],
    manifests["pyproject.toml"],
    manifests["backend/requirements.txt"],
    manifests["backend/pyproject.toml"],
  ].join("\n");
  if (has(/^ProjectSettings\/ProjectVersion\.txt$/) && has(/^Assets\//)) {
    const v = /m_EditorVersion:\s*(\S+)/.exec(
      manifests["ProjectSettings/ProjectVersion.txt"] ?? "",
    )?.[1];
    return { kind: "game-unity", stack: [`Unity${v ? ` ${v}` : ""}`, "C#"] };
  }
  if (has(/\.uproject$/)) return { kind: "game-unreal", stack: ["Unreal Engine", "C++"] };
  if (has(/(^|\/)project\.godot$/)) return { kind: "game-godot", stack: ["Godot", "GDScript"] };
  const deps = (() => {
    try {
      const j = JSON.parse(pkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        bin?: unknown;
        scripts?: Record<string, string>;
      };
      return {
        all: { ...j.dependencies, ...j.devDependencies },
        bin: !!j.bin,
        scripts: j.scripts ?? {},
      };
    } catch {
      return null;
    }
  })();
  if (deps) {
    const d = deps.all;
    for (const [k, label] of [
      ["next", "Next.js"],
      ["react", "React"],
      ["vue", "Vue"],
      ["svelte", "Svelte"],
      ["vite", "Vite"],
      ["express", "Express"],
      ["tailwindcss", "Tailwind"],
      ["@supabase/supabase-js", "Supabase"],
      ["openai", "OpenAI API"],
      ["@anthropic-ai/sdk", "Claude API"],
      ["prisma", "Prisma"],
      ["zustand", "Zustand"],
      ["typescript", "TypeScript"],
    ] as const)
      if (d[k]) stack.push(label);
    if (deps.bin && !deps.scripts.dev)
      return { kind: "cli", stack: stack.length ? stack : ["Node.js"] };
    if (deps.scripts.dev || deps.scripts.start)
      return { kind: "web", stack: stack.length ? stack : ["Node.js"] };
  }
  if (py.trim()) {
    for (const [re, label] of [
      [/fastapi/i, "FastAPI"],
      [/flask/i, "Flask"],
      [/django/i, "Django"],
      [/streamlit/i, "Streamlit"],
      [/sqlalchemy/i, "SQLAlchemy"],
      [/openai/i, "OpenAI API"],
      [/anthropic/i, "Claude API"],
      [/supabase|psycopg/i, "Postgres"],
    ] as const)
      if (re.test(py)) stack.push(label);
    stack.unshift("Python");
    if (has(/\.swift$/)) stack.push("Swift (iOS)");
    if (/fastapi|flask|django|streamlit/i.test(py)) return { kind: "python-web", stack };
    return { kind: "python", stack };
  }
  if (has(/\.swift$/)) return { kind: "ios", stack: ["Swift", "SwiftUI"] };
  if (manifests["Cargo.toml"]) return { kind: "cli", stack: ["Rust"] };
  if (manifests["go.mod"]) return { kind: "cli", stack: ["Go"] };
  return { kind: "other", stack };
}

/** Images the README points to (relative paths), then screenshot-looking files under docs/. */
export function readmeImages(
  readme: string,
  readmePath: string,
  tree: string[],
): { path: string; alt: string }[] {
  const dir =
    path.posix.dirname(readmePath) === "." || !readmePath
      ? ""
      : path.posix.dirname(readmePath) + "/";
  const out: { path: string; alt: string }[] = [];
  const add = (p: string, alt: string) => {
    const clean = path.posix.normalize(p.replace(/^\.\//, "")).replace(/^\/+/, "");
    if (IMAGE.test(clean) && tree.includes(clean) && !out.some((o) => o.path === clean))
      out.push({ path: clean, alt });
  };
  for (const m of readme.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g))
    if (!/^https?:/.test(m[2])) add(dir + m[2], m[1]);
  for (const m of readme.matchAll(/<img[^>]*src=["']([^"']+)["']/g))
    if (!/^https?:/.test(m[1])) add(dir + m[1], "");
  for (const p of tree)
    if (
      /^(docs|screenshots|assets\/screenshots|images)\//i.test(p) &&
      IMAGE.test(p) &&
      /screen|shot|demo|preview/i.test(p)
    )
      add(p, path.posix.basename(p, path.posix.extname(p)));
  return out.slice(0, 8);
}

export async function fetchRepo(
  repoUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepoFacts> {
  const r = parseGithubRepo(repoUrl);
  if (!r) throw new Error("not a GitHub repo URL");
  const api = `https://api.github.com/repos/${r.owner}/${r.repo}`;
  const { body: info, res: infoRes } = await getJson<{
    default_branch: string;
    description: string | null;
    homepage: string | null;
    stargazers_count: number;
    forks_count: number;
  }>(api, fetchImpl);
  if (!info)
    throw new Error(
      infoRes?.status === 403
        ? "GitHub rate limit reached; try again in a few minutes"
        : `GitHub repo ${r.owner}/${r.repo} not found or not public`,
    );
  const branch = info.default_branch;
  const [
    { body: treeBody },
    { res: contribRes, body: contribBody },
    { body: rel },
    { body: issues },
  ] = await Promise.all([
    getJson<{ tree: { path: string; type: string }[] }>(
      `${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      fetchImpl,
    ),
    getJson<unknown[]>(`${api}/contributors?per_page=1&anon=1`, fetchImpl),
    getJson<{ tag_name: string; assets: { download_count: number }[] }[]>(
      `${api}/releases?per_page=5`,
      fetchImpl,
    ),
    getJson<{ title: string; pull_request?: unknown }[]>(
      `${api}/issues?state=open&per_page=10`,
      fetchImpl,
    ),
  ]);
  const tree = (treeBody?.tree ?? [])
    .filter((t) => t.type === "blob")
    .map((t) => t.path)
    .slice(0, 4000);
  const last = /[?&]page=(\d+)>; rel="last"/.exec(contribRes?.headers.get("link") ?? "")?.[1];
  const contributors = last ? Number(last) : (contribBody?.length ?? 0);
  const base = { owner: r.owner, repo: r.repo, branch };
  const readmePath =
    tree.find((p) => /^readme(\.md|\.markdown|\.rst|\.txt)?$/i.test(p)) ??
    tree.find((p) => /^(project|overview|about)\.md$/i.test(p)) ??
    tree.find((p) => /^docs\/readme\.md$/i.test(p)) ??
    tree.find((p) => /(^|\/)readme\.md$/i.test(p)) ??
    "";
  const readme = readmePath ? await getText(rawUrl(base, readmePath), fetchImpl, 12000) : "";
  const manifests: Record<string, string> = {};
  await Promise.all(
    tree
      .filter((p) => MANIFESTS.test(p))
      .slice(0, 10)
      .map(async (p) => {
        manifests[p] = await getText(rawUrl(base, p), fetchImpl, 4000);
      }),
  );
  const { kind, stack } = detectKind(tree, manifests);
  const urls = [
    info.homepage ?? "",
    ...[...readme.matchAll(/https?:\/\/[^\s)"'<>]+/g)].map((m) => m[0]),
  ];
  const playable = urls.find((u) => /itch\.io\/|\/webgl|simmer\.io|play\.unity\.com/i.test(u));
  return {
    url: `https://github.com/${r.owner}/${r.repo}`,
    ...base,
    description: info.description ?? "",
    homepage: info.homepage ?? "",
    stars: info.stargazers_count,
    forks: info.forks_count,
    contributors,
    releases: (rel ?? []).map((x) => ({
      tag: x.tag_name,
      downloads: x.assets.reduce((s, a) => s + a.download_count, 0),
    })),
    openIssues: (issues ?? []).filter((i) => !i.pull_request).map((i) => i.title.slice(0, 120)),
    tree,
    readme: { path: readmePath, text: readme },
    manifests,
    stack,
    kind,
    images: readmeImages(readme, readmePath, tree),
    playableUrl: playable,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
}

/** Downloads README images into <outDir>/repo/ (GIF/WebP → first frame PNG). Returns plan-relative srcs. */
export async function downloadRepoImages(
  f: RepoFacts,
  outDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ src: string; alt: string; path: string }[]> {
  const dir = path.join(outDir, "repo");
  await fs.mkdir(dir, { recursive: true });
  const out: { src: string; alt: string; path: string }[] = [];
  for (const [i, img] of f.images.entries()) {
    try {
      const res = await fetchImpl(rawUrl(f, img.path), { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 6 * 1024 * 1024) continue;
      const ext = path.extname(img.path).toLowerCase();
      let name = `img${i + 1}${ext === ".jpeg" ? ".jpg" : ext}`;
      await fs.writeFile(path.join(dir, name), buf);
      if (ext === ".gif" || ext === ".webp") {
        const png = `img${i + 1}.png`;
        await ffmpeg(["-i", path.join(dir, name), "-frames:v", "1", path.join(dir, png)]);
        await fs.rm(path.join(dir, name), { force: true });
        name = png;
      }
      out.push({ src: `repo/${name}`, alt: img.alt, path: img.path });
    } catch {
      /* skip this image */
    }
  }
  return out;
}

/** Fills `lines` of code elements from the repo (only paths in the tree; at most 22 lines). */
export async function fillCodeLines(
  scenes: VideoPlan["scenes"],
  f: RepoFacts,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const notes: string[] = [];
  const cache = new Map<string, string[]>();
  for (const sc of scenes)
    for (const el of sc.elements) {
      if (el.type !== "code") continue;
      if (!f.tree.includes(el.path)) {
        notes.push(`Code scene: ${el.path} is not in the repo, so it was dropped`);
        el.lines = [];
        continue;
      }
      if (!cache.has(el.path))
        cache.set(el.path, (await getText(rawUrl(f, el.path), fetchImpl, 300000)).split("\n"));
      const all = cache.get(el.path)!;
      const from = Math.max(1, Math.min(el.from ?? 1, all.length));
      const to = Math.min(all.length, Math.max(from, el.to ?? from + 15), from + 21);
      el.from = from;
      el.to = to;
      el.lines = all.slice(from - 1, to);
    }
  return notes;
}

/** Compact repo summary for the agent prompt. */
export function repoDigest(f: RepoFacts) {
  const files = f.tree.filter(
    (p) =>
      !/(^|\/)(node_modules|\.git|dist|build|Library|Temp|obj|bin|Packages)\//.test(p) &&
      !/\.(meta|png|jpe?g|gif|webp|mp3|wav|ogg|fbx|asset|prefab|unity|mat|anim|controller|ttf|otf|shader)$/i.test(
        p,
      ),
  );
  return {
    repo: f.url,
    description: f.description,
    detected_kind: f.kind,
    stack_from_manifests: f.stack,
    public_signals: {
      stars: f.stars,
      forks: f.forks,
      contributors: f.contributors,
      releases: f.releases,
      as_of: f.fetchedAt,
      source: f.url,
    },
    open_issue_titles: f.openIssues,
    readme_path: f.readme.path,
    files: files.slice(0, 250),
    manifests: Object.fromEntries(
      Object.entries(f.manifests).map(([k, v]) => [k, v.slice(0, 1500)]),
    ),
  };
}
