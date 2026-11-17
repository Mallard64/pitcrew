import { connection } from "next/server";
import AutoRefresh from "@/components/AutoRefresh";
import { getStats, listQuotes } from "@/lib/db";

export const metadata = { title: "Stats · Pit Crew" };

export default async function StatsPage() {
  await connection();
  const s = getStats();
  const quotes = listQuotes();
  const tiles = [
    ["Demo videos made", s.videos_made],
    ["Unique projects", s.unique_projects],
    ["Success rate", s.jobs_finished ? `${Math.round(s.success_rate * 100)}%` : "–"],
    ["Median time", s.median_duration_s ? `${Math.floor(s.median_duration_s / 60)}m ${s.median_duration_s % 60}s` : "–"],
    ["Jobs submitted", s.jobs_total],
    ["Feedback", `👍 ${s.thumbs_up} · 👎 ${s.thumbs_down}`],
  ] as const;
  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live stats</h1>
        <p className="mt-1 text-slate-600">Straight from our database, refreshed every 30 seconds. Success = a playable video was delivered (status ok or partial).</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {quotes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What teams said</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quotes.map((q) => (
              <figure key={q.created_at} className="card">
                <blockquote className="text-slate-800">“{q.quote}”</blockquote>
                <figcaption className="mt-2 text-sm text-slate-500">{q.project_name} team</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
