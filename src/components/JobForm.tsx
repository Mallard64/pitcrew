"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JobForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
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
    <form onSubmit={onSubmit} className="card space-y-4" aria-label="Make a demo video">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Project name *</span>
          <input name="project_name" required maxLength={80} placeholder="Pit Crew" className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Live URL *</span>
          <input name="live_url" required placeholder="https://your-project.app" inputMode="url" className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Public GitHub repo <span className="font-normal text-slate-500">(optional, for the Build Log draft)</span>
        </span>
        <input name="repo_url" placeholder="https://github.com/you/project" className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          What it does <span className="font-normal text-slate-500">(optional, 1–2 sentences, used in the intro)</span>
        </span>
        <textarea name="blurb" maxLength={300} rows={2} placeholder="Helps hackathon teams ship a demo video before the deadline." className="field" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Email or Discord <span className="font-normal text-slate-500">(optional, only if you want us to follow up)</span>
        </span>
        <input name="contact" maxLength={100} placeholder="you@school.edu" className="field" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">We only visit public pages. We never log in or submit forms on your site.</p>
        <button className="btn w-full sm:w-auto" disabled={busy}>{busy ? "Starting…" : "Make my demo video"}</button>
      </div>
    </form>
  );
}
