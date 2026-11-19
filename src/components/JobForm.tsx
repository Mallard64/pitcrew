"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LOOKS, VOICES, VOICE_KEYS } from "@/lib/voices";
import { DEFAULT_TARGET_S, formatSeconds, MAX_TARGET_S, MIN_TARGET_S } from "@/lib/pacing";

function lengthHint(s: number) {
  if (s === DEFAULT_TARGET_S) return "Default: lands between 60 and 90 seconds, the length most judges expect.";
  if (s < 60) return "Short: one problem line, one solution line and the 3 strongest demo steps.";
  if (s <= 90) return "Inside the usual 60–90 second pitch range.";
  return `Longer than most hackathon pitches: more demo steps (up to 12). It takes a few minutes longer to make.`;
}

export default function JobForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("auto");
  const [length, setLength] = useState(DEFAULT_TARGET_S);
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
    // The default position keeps the standard 60–90s window rather than a fixed target.
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
          <span className="text-sm font-medium text-slate-200">Live URL *</span>
          <input name="live_url" required placeholder="https://your-project.app" inputMode="url" className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-200">
          Public GitHub repo <span className="font-normal text-slate-500">(optional, for the Build Log draft)</span>
        </span>
        <input name="repo_url" placeholder="https://github.com/you/project" className="field" />
      </label>
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
            <span className="font-mono tabular-nums text-slate-100">{length === DEFAULT_TARGET_S ? "60–90s" : `about ${formatSeconds(length)}`}</span>
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
            aria-valuetext={length === DEFAULT_TARGET_S ? "Default, 60 to 90 seconds" : `About ${formatSeconds(length)}`}
          />
          <span className="flex justify-between text-[11px] text-slate-500" aria-hidden>
            <span>0:30</span><span>1:00</span><span>1:30</span><span>2:00</span><span>2:30</span><span>3:00</span>
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
