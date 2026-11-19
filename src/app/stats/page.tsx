import { connection } from "next/server";
import AutoRefresh from "@/components/AutoRefresh";
import { getStats, listQuotes } from "@/lib/db";

export const metadata = { title: "Stats · Pit Crew" };

export default async function StatsPage() {
  await connection();
  const s = getStats();
  const quotes = listQuotes();
  const tiles = [
    ["Pitch videos made", s.videos_made],
    ["Unique projects", s.unique_projects],
    ["Success rate", s.jobs_finished ? `${Math.round(s.success_rate * 100)}%` : "–"],
    ["Median time", s.median_duration_s ? `${Math.floor(s.median_duration_s / 60)}m ${s.median_duration_s % 60}s` : "–"],
    ["Video produced", `${Math.floor(s.video_seconds / 60)}m ${s.video_seconds % 60}s`],
    ["Jobs submitted", s.jobs_total],
    ["Feedback", s.thumbs_up + s.thumbs_down ? `👍 ${s.thumbs_up} · 👎 ${s.thumbs_down}` : "No ratings yet"],
  ] as const;
  const MODES: [string, string][] = [
    ["live", "Recorded from a live site"],
    ["sandbox-run", "Run from GitHub in a sandbox"],
    ["footage", "From the team's own footage"],
    ["repo-showcase", "From the repository"],
  ];
  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Live stats</h1>
        <p className="mt-1 text-slate-400">Straight from our database, refreshed every 30 seconds. Success = a playable video was delivered (status ok or partial).</p>
        <p className="mt-1 text-sm text-slate-500">So far these are our own test runs on open-source and student projects (Nov 17–18); no outside users yet.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Where the demos came from</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {MODES.map(([k, label]) => (
            <div key={k} className="card">
              <div className="text-sm text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-white">{s.by_mode[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>
      {quotes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">What teams said</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quotes.map((q) => (
              <figure key={q.created_at} className="card">
                <blockquote className="text-slate-200">“{q.quote}”</blockquote>
                <figcaption className="mt-2 text-sm text-slate-500">{q.project_name} team</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
