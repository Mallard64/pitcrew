"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICES, VOICE_KEYS } from "@/lib/voices";
import { formatSeconds } from "@/lib/pacing";

type Ev = { id: number; kind: "progress" | "log" | "status"; step: string | null; message: string; ts: number };
type Artifact = { name: string; bytes: number; version: number };
type JobInfo = {
  id: string;
  created_at: number;
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
  voice?: string | null;
  review_script?: boolean;
  length_s?: number | null;
  closeups?: boolean;
};
type Check = { id: string; label: string; ok: boolean; detail: string };
type Report = { score: number; total: number; checks: Check[]; judge?: { notes: string[]; rewritten: boolean } };
type Review = { scenes: { id: string; section: string; narration: string }[]; report: Report; voice: string; look: string; deadline: number };

const STAGES = [
  ["opening", "Opening your site"],
  ["planning", "Writing the pitch"],
  ["recording", "Recording the demo"],
  ["narrating", "Checking facts"],
  ["voicing", "Voicing"],
  ["assembling", "Rendering"],
] as const;
/** Typical end-to-end time today (see BUILD_LOG); shown as a rough guide, never a promise. */
const TYPICAL_MIN = 10;
const KIT_LABEL: Record<string, string> = { midnight: "Midnight", paper: "Paper", terminal: "Terminal", poster: "Poster", aurora: "Aurora", clean: "Clean", studio: "Studio", blueprint: "Blueprint" };
const SECTION_LABEL: Record<string, string> = { problem: "Problem", solution: "Solution", demo: "Demo", next: "What's next" };
/** One-tap revision requests; the agent reads them like typed ones. */
const QUICK_REVISIONS = ["Make it shorter", "More energetic", "Open with a stronger hook", "Simpler words", "Spend more time on the demo"];
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const FINAL = ["ok", "partial", "failed"];
/** Everything after the video, which gets its own primary button. */
const DOWNLOADS: [string, string][] = [
  ["captions.srt", "Captions (srt)"],
  ["build_log.md", "Build Log draft"],
  ["submission.md", "Submission text"],
  ["sources.md", "Sources"],
  ["script.md", "Script"],
  ["pitch_check.md", "Pitch check"],
];

const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function JobView({ initial }: { initial: { job: JobInfo; artifacts: Artifact[]; review?: Review | null } }) {
  const [job, setJob] = useState(initial.job);
  const [artifacts, setArtifacts] = useState(initial.artifacts);
  const [events, setEvents] = useState<Ev[]>([]);
  const [revising, setRevising] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [reviseVoice, setReviseVoice] = useState(initial.job.voice ?? "");
  const [review, setReview] = useState<Review | null>(initial.review ?? null);
  const [report, setReport] = useState<Report | null>(null);
  const [msg, setMsg] = useState("");
  const lastId = useRef(0);
  const [startedAt, setStartedAt] = useState(initial.job.created_at);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setJob(d.job);
      setArtifacts(d.artifacts);
      setReview(d.review ?? null);
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
        if (e.message === "review") refresh();
        else setReview(null);
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

  useEffect(() => {
    if (FINAL.includes(job.status) && !revising) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job.status, revising]);

  const running = !FINAL.includes(job.status);
  const lastProgress = [...events].reverse().find((e) => e.kind === "progress");
  const stageIdx = running ? Math.max(0, STAGES.findIndex(([k]) => k === lastProgress?.step)) : STAGES.length;
  const contract = job.contract_json ? (JSON.parse(job.contract_json) as { duration_s: number; steps_ok: number; steps_total: number; notes: string }) : null;
  const has = (n: string) => artifacts.some((a) => a.name === n);
  const fileUrl = (n: string, dl = false) => `/api/jobs/${job.id}/files/${n}?v=${job.version}${dl ? "&download" : ""}`;
  const hasReport = has("pitch_check.json");

  useEffect(() => {
    if (!hasReport || running) return;
    fetch(`/api/jobs/${job.id}/files/pitch_check.json?v=${job.version}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => {});
  }, [hasReport, running, job.id, job.version]);

  async function revise(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const voiceChanged = !!reviseVoice && reviseVoice !== (job.voice ?? "");
    const request = reviseText.trim() || (voiceChanged ? "Keep the script as it is; only the narrator voice changes." : "");
    const r = await fetch(`/api/jobs/${job.id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, voice: voiceChanged ? reviseVoice : undefined }) });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error ?? "Could not start the revision");
    setRevising(true);
    setStartedAt(Date.now());
    setReviseText("");
    setJob((j) => ({ ...j, status: "queued", voice: voiceChanged ? reviseVoice : j.voice }));
    listen();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{job.project_name}</h1>
        <a href={job.live_url} target="_blank" rel="noreferrer" className="w-fit text-sm text-slate-400 underline-offset-2 hover:underline">{job.live_url}</a>
      </div>

      {job.status === "review" && review && <ReviewPanel jobId={job.id} review={review} now={now} />}

      {(running || revising) && job.status !== "review" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card space-y-4" aria-live="polite">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {STAGES.map(([key, label], i) => (
              <li key={key} className={`rounded-lg border px-3 py-2 text-xs font-medium ${i < stageIdx ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : i === stageIdx ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/10 text-slate-500"}`}>
                {i < stageIdx ? "✓ " : i === stageIdx ? <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white align-middle" /> : null}
                {label}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-slate-300">{job.status === "queued" ? "Waiting for a free slot…" : (lastProgress?.message ?? "Starting…")}</p>
            <p className="font-mono text-slate-500">
              {mmss(Math.max(0, now - startedAt))} elapsed · usually ~{TYPICAL_MIN} min
            </p>
          </div>
          <div ref={logRef} className="max-h-56 overflow-auto rounded-lg border border-white/5 bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-400">
            {events.filter((e) => e.kind !== "status").map((e) => (
              <div key={e.id} className={e.kind === "progress" ? "text-white" : ""}>{e.kind === "progress" ? "▸ " : "  "}{e.message}</div>
            ))}
            {!events.length && <div>Connecting…</div>}
          </div>
        </div>
        <WhileYouWait />
        </div>
      )}

      {job.status === "failed" && (
        <div className="card border-red-500/30 bg-red-500/10">
          <h2 className="font-semibold text-red-200">This one didn&apos;t work</h2>
          <p className="mt-1 text-sm text-red-200/90">{job.error ?? "Unknown error"}</p>
          <p className="mt-3 text-sm text-red-200/80">Common causes: the site needs a login, blocks headless browsers, or took too long to load. <Link href="/#make" className="font-semibold underline">Try again</Link>, maybe with a different page of your app.</p>
        </div>
      )}

      {!running && has("demo.mp4") && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <video key={job.version} controls playsInline preload="metadata" poster={has("thumb.jpg") ? fileUrl("thumb.jpg") : undefined} className="aspect-video w-full rounded-2xl border border-white/10 bg-black shadow-2xl" src={fileUrl("demo.mp4")} />
            {contract && (
              <p className="text-sm text-slate-500">
                {contract.duration_s}s · {contract.steps_ok}/{contract.steps_total} demo steps · {job.render_mode === "remotion" ? "pitch video" : job.render_mode === "slideshow" ? "slideshow fallback" : "fallback editor"}
                {job.style_kit && KIT_LABEL[job.style_kit] ? ` · ${KIT_LABEL[job.style_kit]} look` : ""}
                {job.length_s ? ` · aimed for ${formatSeconds(job.length_s)}` : ""}
                {job.closeups ? " · UI close-ups" : ""}
                {job.duration_ms ? ` · made in ${mmss(job.duration_ms)}` : ""}
                {job.version > 1 ? ` · version ${job.version}` : ""}
                {job.status === "partial" && contract.notes ? <span className="block text-amber-300">Heads up: {contract.notes}</span> : null}
              </p>
            )}
            {job.error && <p className="text-sm text-amber-300">{job.error}</p>}
            {report && <PitchCard report={report} />}
          </div>
          <aside className="space-y-4">
            <div className="card space-y-3">
              <a href={fileUrl("demo.mp4", true)} className="btn w-full justify-between py-3 text-base">
                <span>Download video</span>
                <span className="text-xs font-normal text-white/80">mp4 · {fmtBytes(artifacts.find((a) => a.name === "demo.mp4")!.bytes)}</span>
              </a>
              <div>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">For your submission</h2>
                <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                  {DOWNLOADS.filter(([n]) => has(n)).map(([n, label]) => (
                    <li key={n}>
                      <a href={fileUrl(n, true)} className="flex items-center justify-between px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                        <span>{label}</span>
                        <span className="text-xs text-slate-500">{fmtBytes(artifacts.find((a) => a.name === n)!.bytes)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              {!has("build_log.md") && <p className="text-xs text-slate-500">Add a public GitHub repo next time to get a Build Log draft.</p>}
            </div>
            <form onSubmit={revise} className="card space-y-2">
              <h2 className="font-semibold text-white">Revise</h2>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REVISIONS.map((q) => (
                  <button key={q} type="button" onClick={() => setReviseText(q)} className={`rounded-full border px-2.5 py-1 text-xs ${reviseText === q ? "border-indigo-400 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}>
                    {q}
                  </button>
                ))}
              </div>
              <textarea value={reviseText} onChange={(e) => setReviseText(e.target.value)} rows={2} maxLength={300} placeholder="Or say it in your words: focus on pricing, mention the API" className="field text-sm" />
              <label className="block text-xs text-slate-400">
                Narrator
                <select value={reviseVoice} onChange={(e) => setReviseVoice(e.target.value)} className="field mt-1 text-sm">
                  <option value="">{job.voice && VOICES[job.voice as keyof typeof VOICES] ? `Keep ${VOICES[job.voice as keyof typeof VOICES].label}` : "Keep the current voice"}</option>
                  {VOICE_KEYS.filter((k) => k !== job.voice).map((k) => (
                    <option key={k} value={k}>{VOICES[k].label}: {VOICES[k].tone}</option>
                  ))}
                </select>
              </label>
              {msg && <p className="text-xs text-red-300">{msg}</p>}
              <button className="btn w-full" disabled={(reviseText.trim().length < 2 && !reviseVoice) || revising}>Make a new version</button>
            </form>
            <Feedback jobId={job.id} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Rule checks a judge would care about, plus the agent's judge-pass notes. */
function PitchCard({ report, hint = true }: { report: Report; hint?: boolean }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-white">Pitch check</h2>
        <span className="font-mono text-sm text-slate-400">{report.score}/{report.total}</span>
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {report.checks.map((c) => (
          <li key={c.id} className="flex gap-2" title={c.detail}>
            <span aria-hidden className={c.ok ? "text-emerald-300" : "text-amber-300"}>{c.ok ? "✓" : "!"}</span>
            <span className={c.ok ? "text-slate-300" : "text-amber-200"}>
              {c.label}
              {!c.ok && <span className="block text-xs text-slate-500">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {report.judge?.notes.length ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Judge pass {report.judge.rewritten ? "· applied" : "· not applied (scored lower)"}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-slate-300">
            {report.judge.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ) : null}
      {hint && <p className="text-xs text-slate-500">Want a different angle? Use a quick revision, or edit the script yourself next time with &ldquo;Let me review the script&rdquo;.</p>}
    </div>
  );
}

/** Shown while the job runs: a finished example and what's happening, so 10 minutes isn't a blank page. */
function WhileYouWait() {
  return (
    <aside className="card space-y-3">
      <h2 className="font-semibold text-white">While you wait</h2>
      <video src="/samples/tldraw.mp4" poster="/samples/tldraw.jpg" controls muted playsInline preload="none" className="aspect-video w-full rounded-lg border border-white/10 bg-black" />
      <p className="text-xs text-slate-500">An unedited example from tldraw.com. Yours is being made the same way.</p>
      <ul className="space-y-1.5 text-sm text-slate-300">
        <li>• You can close this tab: the link keeps working.</li>
        <li>• Every number in the video is re-checked against its source page.</li>
        <li>• The agent rereads its script as a judge would before it&apos;s voiced.</li>
        <li>• When it&apos;s done you can revise it in plain words or switch the narrator.</li>
      </ul>
    </aside>
  );
}

/** Human in the loop: edit the narration before it's voiced and rendered. */
function ReviewPanel({ jobId, review, now }: { jobId: string; review: Review; now: number }) {
  const [lines, setLines] = useState(() => Object.fromEntries(review.scenes.map((s) => [s.id, s.narration])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const left = Math.max(0, review.deadline - now);
  const words = Object.values(lines).join(" ").trim().split(/\s+/).filter(Boolean).length;
  const voice = VOICES[review.voice as keyof typeof VOICES];
  async function approve() {
    setBusy(true);
    setErr("");
    const scenes = review.scenes.map((s) => ({ id: s.id, narration: lines[s.id] ?? s.narration }));
    const r = await fetch(`/api/jobs/${jobId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenes }) });
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? "Could not continue");
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Your script, before it&apos;s voiced</h2>
          <p className="font-mono text-sm text-slate-400">continues on its own in {mmss(left)}</p>
        </div>
        <p className="text-sm text-slate-400">
          The demo is recorded. Edit any line, then continue. {voice ? `${voice.label} will read it` : "It will be voiced"} in the {KIT_LABEL[review.look] ?? review.look} look. Numbers in the problem need a checked source, so new ones are removed.
        </p>
        <ol className="space-y-3">
          {review.scenes.map((s) => (
            <li key={s.id}>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{SECTION_LABEL[s.section] ?? s.section}</span>
                <textarea value={lines[s.id]} onChange={(e) => setLines((l) => ({ ...l, [s.id]: e.target.value }))} rows={2} maxLength={400} className="field text-sm" />
              </label>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{words} words ≈ {Math.round(words / 3)}s of narration (aim for 150–240 words)</p>
          <button onClick={approve} disabled={busy} className="btn">{busy ? "Continuing…" : "Voice and render this"}</button>
        </div>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      </div>
      <PitchCard report={review.report} hint={false} />
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
  if (sent) return <div className="card text-sm text-slate-400">Thanks for the feedback!</div>;
  return (
    <div className="card space-y-2">
      <h2 className="font-semibold text-white">Was this useful?</h2>
      <div className="flex gap-2">
        {([1, -1] as const).map((r) => (
          <button key={r} type="button" aria-pressed={rating === r} onClick={() => { setRating(r); if (r === -1) { send(r); setSent(true); } }} className={`btn-ghost flex-1 text-lg ${rating === r ? "border-indigo-400" : ""}`}>
            {r === 1 ? "👍" : "👎"}
          </button>
        ))}
      </div>
      {rating === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); send(1, quote); setSent(true); }} className="space-y-2">
          <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={400} placeholder="One line on how it helped (optional)" className="field text-sm" />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={canQuote} onChange={(e) => setCanQuote(e.target.checked)} /> You can quote me
          </label>
          <button className="btn w-full">Send</button>
        </form>
      )}
    </div>
  );
}
