/** Reads a public GitHub repo's recent commits + README (read-only, never executes repo code). */
export type Commit = { sha: string; date: string; message: string; author: string };

export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function fetchRepoFacts(
  repoUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ commits: Commit[]; readme: string }> {
  const r = parseGithubRepo(repoUrl);
  if (!r) throw new Error("not a GitHub repo URL");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "pit-crew" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${r.owner}/${r.repo}`;
  const commits: Commit[] = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetchImpl(`${api}/commits?per_page=100&page=${page}`, { headers });
    if (!res.ok) {
      if (page === 1) throw new Error(`GitHub API ${res.status} for ${r.owner}/${r.repo}`);
      break;
    }
    const batch = (await res.json()) as { sha: string; commit: { message: string; author: { name: string; date: string } } }[];
    for (const c of batch)
      commits.push({ sha: c.sha.slice(0, 7), date: c.commit.author.date, message: c.commit.message.trim(), author: c.commit.author.name });
    if (batch.length < 100) break;
  }
  let readme = "";
  const rr = await fetchImpl(`${api}/readme`, { headers: { ...headers, Accept: "application/vnd.github.raw+json" } });
  if (rr.ok) readme = (await rr.text()).slice(0, 6000);
  return { commits, readme };
}

/**
 * A factual build log made only from commit messages, grouped by day (no LLM, nothing invented).
 * Keeps the most recent commits that fit in the word budget, then prints them oldest-first.
 */
export function localBuildLog(projectName: string, commits: Commit[], maxWords = 600): string {
  const useful = commits.filter((c) => !/^merge (pull request|branch)/i.test(c.message));
  if (!useful.length) return `# ${projectName}: Build Log\n\nNo commits found.\n`;
  const kept: Commit[] = [];
  let words = 25;
  for (const c of [...useful].sort((a, b) => b.date.localeCompare(a.date))) {
    const w = c.message.split("\n")[0].split(/\s+/).length + 2;
    if (words + w > maxWords) break;
    words += w;
    kept.push(c);
  }
  const byDay = new Map<string, Commit[]>();
  for (const c of kept.reverse()) {
    const day = c.date.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(c);
  }
  const trimmed = kept.length < useful.length ? ` (latest ${kept.length} of ${useful.length} shown)` : "";
  const lines = [`# ${projectName}: Build Log`, "", `_Drafted by Pit Crew from commit messages${trimmed}. Edit before posting._`, ""];
  for (const [day, cs] of byDay) {
    lines.push(`## ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
    for (const c of cs) lines.push(`- ${c.message.split("\n")[0].slice(0, 140)} (\`${c.sha}\`)`);
    lines.push("");
  }
  return lines.join("\n");
}
