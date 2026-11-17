import { connection } from "next/server";
import JobForm from "@/components/JobForm";
import { getStats } from "@/lib/db";

const STEPS = [
  { t: "Paste your link", d: "Your live URL, plus your repo if you want a Build Log draft." },
  { t: "We tour your app", d: "An agent plans a 45–90s walkthrough, records it in Chromium and writes the narration." },
  { t: "Download and revise", d: "Get demo.mp4, captions and a Build Log draft. Ask for changes in plain words." },
];

export default async function Home() {
  await connection();
  const s = getStats();
  return (
    <div className="space-y-14">
      <section className="space-y-5 text-center">
        <p className="mx-auto w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          For Big Hack Game teams · submissions due Nov 19, 11:59 AM PST
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Your demo video, done before the deadline.</h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-600">
          Paste your project&apos;s link. Pit Crew tours your app, records it, narrates it and hands you a{" "}
          <span className="font-semibold text-slate-900">demo.mp4</span>, captions and a <span className="font-semibold text-slate-900">Build Log</span> draft.
        </p>
        {s.videos_made > 0 && (
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{s.videos_made}</span> demo video{s.videos_made === 1 ? "" : "s"} made for{" "}
            <span className="font-semibold text-slate-900">{s.unique_projects}</span> project{s.unique_projects === 1 ? "" : "s"} so far
          </p>
        )}
      </section>

      <section id="make" className="mx-auto max-w-2xl scroll-mt-20">
        <JobForm />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((x, i) => (
          <div key={x.t} className="card">
            <div className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{i + 1}</div>
            <h3 className="font-semibold">{x.t}</h3>
            <p className="mt-1 text-sm text-slate-600">{x.d}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-2 text-sm text-slate-600">
        <h2 className="text-base font-semibold text-slate-900">What to expect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Most videos take 2–5 minutes. You can leave the page open and watch progress live.</li>
          <li>Login-walled apps: we record your public pages only and tell you so.</li>
          <li>If a click fails, we drop that step rather than show a broken screen. Revise to steer it.</li>
          <li>Narration only describes what is on your site or in your description. Check it before you submit.</li>
        </ul>
      </section>
    </div>
  );
}
