"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LOOKS, VOICES, VOICE_KEYS } from "@/lib/voices";
import { DEFAULT_TARGET_S, formatSeconds, MAX_TARGET_S, MIN_TARGET_S } from "@/lib/pacing";

function lengthHint(s: number) {
  if (s === DEFAULT_TARGET_S) return "Default: 90–120 seconds, room for the full outline (problem, demo, evidence, how it's built, next, the ask).";
  if (s < 60) return "Short: one problem line, one solution line and the 3 strongest demo steps.";
  if (s <= 90) return "Tight: the outline's optional sections get shortened or dropped.";
  return "Long: more demo and fuller sections (up to 12 demo steps). It takes a few minutes longer to make.";
}

export default function JobForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("auto");
  const [length, setLength] = useState(DEFAULT_TARGET_S);
  const [upload, setUpload] = useState<{ state: "idle" | "uploading" | "done" | "error"; pct?: number; id?: string; info?: string }>({ state: "idle" });

  async function onFootage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setUpload({ state: "idle" });
    if (file.size > 500 * 1024 * 1024) return setUpload({ state: "error", info: "Footage must be 500 MB or less" });
    const type = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    setUpload({ state: "uploading", pct: 0 });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setUpload({ state: "uploading", pct: Math.round((ev.loaded / ev.total) * 100) });
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 201) setUpload({ state: "done", id: data.id, info: `${Math.round(data.duration_s)} s` });
        else setUpload({ state: "error", info: data.error ?? "Upload failed" });
      } catch {
        setUpload({ state: "error", info: "Upload failed" });
      }
    };
    xhr.onerror = () => setUpload({ state: "error", info: "Upload failed; check your connection" });
    xhr.send(file);
  }
  const audio = useRef<HTMLAudioElement | null>(null);
  const preview = () => {
    if (voice === "auto") return;
    audio.current?.pause();
    audio.current = new Audio(`/voices/${voice}.mp3`);
    audio.current.play().catch(() => {});
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(fd.entries());
    body.review_script = fd.get("review_script") === "on";
    body.closeups = fd.get("closeups") === "on";
    if (!body.live_url && !body.repo_url) {
      setError("Add a live link or a public GitHub repo");
      setBusy(false);
      return;
    }
    if (upload.state === "uploading") {
      setError("Wait for the footage upload to finish");
      setBusy(false);
      return;
    }
    if (upload.state === "done" && upload.id) body.footage = upload.id;
    // The default position keeps the standard 90–120s window rather than a fixed target.
    if (length === DEFAULT_TARGET_S) delete body.length_s;
    else body.length_s = length;
    for (const k of ["voice", "look"]) if (body[k] === "auto") delete body[k];
    try {
      const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" aria-label="Make a pitch video">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">Project name *</span>
          <input name="project_name" required maxLength={80} placeholder="Pit Crew" className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">
            Live URL <span className="font-normal text-slate-500">(or a repo below)</span>
          </span>
          <input name="live_url" placeholder="https://your-project.app" inputMode="url" className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          Public GitHub repo <span className="font-normal text-slate-500">(needed if there&apos;s no live link; also drafts your progress update)</span>
        </span>
        <input name="repo_url" placeholder="https://github.com/you/project" className="field" />
        <span className="block text-xs text-slate-500">
          No live link? We run web apps from the repo in a HarnessRouter sandbox (never on our servers), or build the demo from your repo&apos;s screenshots and code, labeled as such.
        </span>
      </label>
      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          Your own footage <span className="font-normal text-slate-500">(optional MP4/MOV, up to 500 MB and 3 min: gameplay, a screen recording)</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={onFootage} className="text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-100" aria-label="Upload your own footage" />
          {upload.state === "uploading" && <span className="text-xs text-slate-400" role="status">Uploading… {upload.pct}%</span>}
          {upload.state === "done" && <span className="text-xs text-emerald-300" role="status">Uploaded ({upload.info}). It becomes the demo.</span>}
          {upload.state === "error" && <span className="text-xs text-red-300" role="alert">{upload.info}</span>}
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          What it does <span className="font-normal text-slate-500">(optional, 1–2 sentences)</span>
        </span>
        <textarea name="blurb" maxLength={300} rows={2} placeholder="Helps hackathon teams ship a demo video before the deadline." className="field" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">
            What problem does this solve? <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea name="problem" maxLength={300} rows={2} placeholder="Teams spend hours making a demo video the night before the deadline." className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">
            What&apos;s next? <span className="font-normal text-slate-500">(optional, one per line)</span>
          </span>
          <textarea name="whats_next" maxLength={300} rows={2} placeholder={"Team workspaces\nProduct Hunt launch kit"} className="field" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">
            Evidence <span className="font-normal text-slate-500">(optional: users, quotes, numbers, links)</span>
          </span>
          <textarea name="evidence" maxLength={600} rows={2} placeholder={"40 teams used it at our hackathon\n\"Saved us an hour\" – Maya, team lead"} className="field" />
          <span className="block text-xs text-slate-500">Only what you give us (or your repo&apos;s public GitHub numbers) is shown. Nothing real? The section is left out.</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-200">
            Built with / why <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea name="built_with" maxLength={300} rows={2} placeholder="HarnessRouter for the agent: one API for many models, with cost routing." className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          Your ask <span className="font-normal text-slate-500">(optional: users, feedback, intros, investment, collaborators)</span>
        </span>
        <input name="ask" maxLength={200} placeholder="Try it and tell us what breaks" className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          Email or Discord <span className="font-normal text-slate-500">(optional, only for follow-up)</span>
        </span>
        <input name="contact" maxLength={100} placeholder="you@school.edu" className="field" />
      </label>
      <fieldset className="space-y-3 rounded-xl border border-white/10 p-4">
        <legend className="px-1 text-sm font-medium text-slate-200">Your call <span className="font-normal text-slate-500">(optional)</span></legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm text-slate-300">Narrator</span>
            <div className="flex gap-2">
              <select name="voice" value={voice} onChange={(e) => setVoice(e.target.value)} className="field">
                <option value="auto">Auto: matches the look</option>
                {VOICE_KEYS.map((k) => (
                  <option key={k} value={k}>{VOICES[k].label}: {VOICES[k].tone}</option>
                ))}
              </select>
              <button type="button" onClick={preview} disabled={voice === "auto"} className="btn-ghost shrink-0 px-3" aria-label="Play a voice sample">▶</button>
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-slate-300">Look</span>
            <select name="look" defaultValue="auto" className="field">
              <option value="auto">Auto: the agent picks</option>
              {LOOKS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between text-sm text-slate-300">
            <span>Length</span>
            <span className="font-mono tabular-nums text-slate-100">{length === DEFAULT_TARGET_S ? "90–120s" : `about ${formatSeconds(length)}`}</span>
          </span>
          <input
            type="range"
            name="length_s"
            min={MIN_TARGET_S}
            max={MAX_TARGET_S}
            step={15}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full accent-indigo-500"
            aria-valuetext={length === DEFAULT_TARGET_S ? "Default, 90 to 120 seconds" : `About ${formatSeconds(length)}`}
          />
          <span className="flex justify-between text-[11px] text-slate-500" aria-hidden>
            <span>0:30</span><span>1:00</span><span>1:30</span><span>2:00</span><span>2:30</span><span>3:00</span>
          </span>
          <span className="flex flex-wrap gap-2" role="group" aria-label="Length presets">
            {[["Auto", DEFAULT_TARGET_S], ["60 s", 60], ["2 min", 120], ["3 min", 180]].map(([label, v]) => (
              <button key={label} type="button" onClick={() => setLength(v as number)} aria-pressed={length === v} className={`rounded-full border px-3 py-1 text-xs ${length === v ? "border-indigo-400 bg-indigo-500/20 text-indigo-100" : "border-white/15 text-slate-300 hover:border-white/30"}`}>
                {label}
              </button>
            ))}
          </span>
          <span className="block text-xs text-slate-500">{lengthHint(length)}</span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-slate-300">
          <input type="checkbox" name="closeups" className="mt-1 accent-indigo-500" />
          <span>
            Magnify the UI in every demo step
            <span className="block text-xs text-slate-500">Each step keeps the full screen in view and pops out a zoomed, live close-up of the panel it touches. Without this the agent zooms only where it helps.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-slate-300">
          <input type="checkbox" name="review_script" className="mt-1 accent-indigo-500" />
          <span>
            Let me review the script before it&apos;s voiced
            <span className="block text-xs text-slate-500">The job pauses after the demo is recorded so you can edit every line. It continues on its own after 10 minutes.</span>
          </span>
        </label>
      </fieldset>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">We only visit public pages. We never log in or submit forms on your site.</p>
        <button className="btn w-full sm:w-auto" disabled={busy}>{busy ? "Starting…" : "Make my pitch video"}</button>
      </div>
    </form>
  );
}
