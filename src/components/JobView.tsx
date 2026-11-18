"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Ev = { id: number; kind: "progress" | "log" | "status"; step: string | null; message: string; ts: number };
type Artifact = { name: string; bytes: number; version: number };
type JobInfo = {
  id: string;
  project_name: string;
  live_url: string;
  status: string;
  version: number;
  error: string | null;
  duration_ms: number | null;
  render_mode: string | null;
  contract_json: string | null;
  plan_source: string | null;
  style_kit?: string | null;
  seed?: number | null;
};

const STAGES = [
  ["opening", "Opening site"],
  ["planning", "Planning flow"],
  ["recording", "Recording"],
  ["narrating", "Writing narration"],
  ["voicing", "Voicing"],
  ["assembling", "Assembling"],
] as const;
const FINAL = ["ok", "partial", "failed"];
const DOWNLOADS: [string, string][] = [
  ["demo.mp4", "Video (mp4)"],
  ["captions.srt", "Captions (srt)"],
  ["build_log.md", "Build Log draft"],
  ["submission.md", "Submission text"],
  ["script.md", "Script"],
];

const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function JobView({ initial }: { initial: { job: JobInfo; artifacts: Artifact[] } }) {
  const [job, setJob] = useState(initial.job);
  const [artifacts, setArtifacts] = useState(initial.artifacts);
  const [events, setEvents] = useState<Ev[]>([]);
  const [revising, setRevising] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [msg, setMsg] = useState("");
  const lastId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setJob(d.job);
      setArtifacts(d.artifacts);
    }
  }, [job.id]);

  const listen = useCallback(() => {
    const es = new EventSource(`/api/jobs/${job.id}/events?after=${lastId.current}`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as Ev;
      lastId.current = Math.max(lastId.current, e.id);
      setEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [...prev, e]));
      if (e.kind === "status") {
        setJob((j) => ({ ...j, status: e.message }));
        if (FINAL.includes(e.message)) {
          es.close();
          setRevising(false);
          refresh();
        }
      }
    };
    es.addEventListener("done", () => {
      es.close();
      refresh();
    });
    return es;
  }, [job.id, refresh]);

  useEffect(() => {
    const es = listen();
    return () => es.close();
  }, [listen]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events]);

  const running = !FINAL.includes(job.status);
  const lastProgress = [...events].reverse().find((e) => e.kind === "progress");
  const stageIdx = running ? Math.max(0, STAGES.findIndex(([k]) => k === lastProgress?.step)) : STAGES.length;
  const contract = job.contract_json ? (JSON.parse(job.contract_json) as { duration_s: number; steps_ok: number; steps_total: number; notes: string }) : null;
  const has = (n: string) => artifacts.some((a) => a.name === n);
  const fileUrl = (n: string, dl = false) => `/api/jobs/${job.id}/files/${n}?v=${job.version}${dl ? "&download" : ""}`;

  async function revise(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch(`/api/jobs/${job.id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: reviseText }) });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error ?? "Could not start the revision");
    setRevising(true);
    setReviseText("");
    setJob((j) => ({ ...j, status: "queued" }));
    listen();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{job.project_name}</h1>
        <a href={job.live_url} target="_blank" rel="noreferrer" className="w-fit text-sm text-slate-500 underline-offset-2 hover:underline">{job.live_url}</a>
      </div>

      {(running || revising) && (
        <div className="card space-y-4" aria-live="polite">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {STAGES.map(([key, label], i) => (
              <li key={key} className={`rounded-lg border px-3 py-2 text-xs font-medium ${i < stageIdx ? "border-emerald-200 bg-emerald-50 text-emerald-800" : i === stageIdx ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-400"}`}>
                {i < stageIdx ? "✓ " : i === stageIdx ? <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white align-middle" /> : null}
                {label}
              </li>
            ))}
          </ol>
          <p className="text-sm text-slate-600">{job.status === "queued" ? "Waiting for a free slot…" : (lastProgress?.message ?? "Starting…")}</p>
          <div ref={logRef} className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
            {events.filter((e) => e.kind !== "status").map((e) => (
              <div key={e.id} className={e.kind === "progress" ? "text-white" : ""}>{e.kind === "progress" ? "▸ " : "  "}{e.message}</div>
            ))}
            {!events.length && <div>Connecting…</div>}
          </div>
        </div>
      )}

      {job.status === "failed" && (
        <div className="card border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-800">This one didn&apos;t work</h2>
          <p className="mt-1 text-sm text-red-700">{job.error ?? "Unknown error"}</p>
          <p className="mt-3 text-sm text-red-700">Common causes: the site needs a login, blocks headless browsers, or took too long to load. <Link href="/#make" className="font-semibold underline">Try again</Link>, maybe with a different page of your app.</p>
        </div>
      )}

      {!running && has("demo.mp4") && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <video key={job.version} controls playsInline preload="metadata" poster={has("thumb.jpg") ? fileUrl("thumb.jpg") : undefined} className="aspect-video w-full rounded-2xl bg-black shadow-lg" src={fileUrl("demo.mp4")} />
            {contract && (
              <p className="text-sm text-slate-500">
                {contract.duration_s}s · {contract.steps_ok}/{contract.steps_total} demo steps · {job.render_mode === "remotion" ? "pitch video" : job.render_mode === "slideshow" ? "slideshow fallback" : "fallback editor"}
                {job.seed != null ? ` · seed ${job.seed}` : ""}
                {job.version > 1 ? ` · version ${job.version}` : ""}
                {job.status === "partial" && contract.notes ? <span className="block text-amber-700">Heads up: {contract.notes}</span> : null}
              </p>
            )}
            {job.error && <p className="text-sm text-amber-700">{job.error}</p>}
          </div>
          <aside className="space-y-4">
            <div className="card space-y-2">
              <h2 className="font-semibold">Downloads</h2>
              {DOWNLOADS.filter(([n]) => has(n)).map(([n, label]) => (
                <a key={n} href={fileUrl(n, true)} className="btn-ghost w-full justify-between">
                  <span>{label}</span>
                  <span className="text-xs text-slate-500">{fmtBytes(artifacts.find((a) => a.name === n)!.bytes)}</span>
                </a>
              ))}
              {!has("build_log.md") && <p className="text-xs text-slate-500">Add a public GitHub repo next time to get a Build Log draft.</p>}
            </div>
            <form onSubmit={revise} className="card space-y-2">
              <h2 className="font-semibold">Revise</h2>
              <textarea value={reviseText} onChange={(e) => setReviseText(e.target.value)} rows={2} maxLength={300} placeholder="e.g. make it shorter, focus on pricing" className="field text-sm" />
              {msg && <p className="text-xs text-red-700">{msg}</p>}
              <button className="btn w-full" disabled={reviseText.trim().length < 2 || revising}>Make a new version</button>
            </form>
            <Feedback jobId={job.id} />
          </aside>
        </div>
      )}
    </div>
  );
}

function Feedback({ jobId }: { jobId: string }) {
  const [rating, setRating] = useState<1 | -1 | 0>(0);
  const [quote, setQuote] = useState("");
  const [canQuote, setCanQuote] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async (r: 1 | -1, q?: string) => {
    await fetch(`/api/jobs/${jobId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: r, quote: q, can_quote: canQuote }) });
  };
  if (sent) return <div className="card text-sm text-slate-600">Thanks for the feedback!</div>;
  return (
    <div className="card space-y-2">
      <h2 className="font-semibold">Was this useful?</h2>
      <div className="flex gap-2">
        {([1, -1] as const).map((r) => (
          <button key={r} type="button" aria-pressed={rating === r} onClick={() => { setRating(r); if (r === -1) { send(r); setSent(true); } }} className={`btn-ghost flex-1 text-lg ${rating === r ? "border-slate-900" : ""}`}>
            {r === 1 ? "👍" : "👎"}
          </button>
        ))}
      </div>
      {rating === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); send(1, quote); setSent(true); }} className="space-y-2">
          <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={400} placeholder="One line on how it helped (optional)" className="field text-sm" />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={canQuote} onChange={(e) => setCanQuote(e.target.checked)} /> You can quote me
          </label>
          <button className="btn w-full">Send</button>
        </form>
      )}
    </div>
  );
}
