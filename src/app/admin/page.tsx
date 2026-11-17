import { notFound } from "next/navigation";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { listJobs } from "@/lib/db";

export const metadata = { title: "Admin · Pit Crew", robots: { index: false } };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await connection();
  const token = (await searchParams).token;
  if (!config.adminToken || token !== config.adminToken) notFound();
  const jobs = listJobs(300);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Jobs ({jobs.length})</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{["When", "Project", "Status", "Time", "Mode", "Planner", "Contact", "Error", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{new Date(j.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td className="px-3 py-2"><a className="font-medium underline" href={`/jobs/${j.id}`}>{j.project_name}</a><div className="max-w-[16rem] truncate text-xs text-slate-500">{j.live_url}</div></td>
                <td className="px-3 py-2">{j.status}{j.version > 1 ? ` (v${j.version})` : ""}</td>
                <td className="px-3 py-2 tabular-nums">{j.duration_ms ? `${Math.round(j.duration_ms / 1000)}s` : "–"}</td>
                <td className="px-3 py-2">{j.render_mode ?? "–"}</td>
                <td className="px-3 py-2">{j.plan_source ?? "–"}</td>
                <td className="px-3 py-2">{j.contact ?? ""}</td>
                <td className="max-w-xs px-3 py-2 text-xs text-red-700">{j.error ?? ""}</td>
                <td className="px-3 py-2">
                  <form action="/api/admin/rerun" method="post">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="id" value={j.id} />
                    <button className="btn-ghost text-xs">Rerun</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
