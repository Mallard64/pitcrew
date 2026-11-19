import Image from "next/image";
import { connection } from "next/server";
import JobForm from "@/components/JobForm";
import { getStats } from "@/lib/db";

// Real, unedited Pit Crew output (re-encoded to 720p for the web). Both are public products, used as samples.
const SAMPLES = [
  {
    file: "tldraw",
    name: "tldraw",
    url: "tldraw.com",
    kit: "midnight",
    note: "62s · problem → solution → 7-step live demo · voiced + captioned",
  },
  {
    file: "excalidraw",
    name: "Excalidraw",
    url: "excalidraw.com",
    kit: "paper",
    note: "71s · the agent chose the editorial look for a hand-drawn tool",
  },
];

const KITS = [
  { id: "midnight", label: "Midnight", fit: "AI, infra, pro tools" },
  { id: "paper", label: "Paper", fit: "Writing, education, research" },
  { id: "terminal", label: "Terminal", fit: "Developer tools, APIs" },
  { id: "poster", label: "Poster", fit: "Bold consumer, events" },
  { id: "aurora", label: "Aurora", fit: "Creative, music, design" },
  { id: "clean", label: "Clean", fit: "Productivity, B2B, health" },
  { id: "studio", label: "Studio", fit: "Launches, consumer, media" },
  { id: "blueprint", label: "Blueprint", fit: "Hardware, data, science" },
];

const GETS = [
  {
    t: "A pitch video, 30s to 3 min",
    d: "Problem → demo → evidence → how it's built → next → the ask. 90–120s by default, or the length you pick. Narrated, captioned, 1080p60, with zooms and magnified close-ups of your UI.",
  },
  {
    t: "Submission text",
    d: "What it is, the problem, how it works and what's next, written from your site and repo. Ready to paste.",
  },
  {
    t: "Build Log draft",
    d: "Dated sections from your commit history: what you built, decided, struggled with. Add a public repo to get it.",
  },
  {
    t: "sources.md",
    d: "Every statistic in the video with the page it came from and the exact sentence we matched. No source, no stat.",
  },
];

const HOW = [
  {
    t: "An agent studies your app",
    d: "It opens your live site, reads your copy (and README), and writes the pitch: the problem, the one-line solution, the wow moment.",
  },
  {
    t: "It records a real demo",
    d: "It plans the clicks, verifies every selector, and we record them in Chromium with a smooth cursor, human-speed typing and zooms.",
  },
  {
    t: "Every number is checked",
    d: "Statistics come from a web search; we re-fetch each source page and keep a number only if it appears there exactly.",
  },
  {
    t: "Voiced, styled, rendered",
    d: "Narration is voiced at a pace that fits your length, the agent picks a look that suits your product, and Remotion renders it.",
  },
];

export default async function Home() {
  await connection();
  const s = getStats();
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-6">
          <p className="w-fit rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
            For Big Hack Game teams · submissions due Nov 19, 11:59 AM PST
          </p>
          {/* One sentence per line, so the break never lands mid-name ("Pit / Crew"). */}
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-balance text-white sm:text-5xl xl:text-6xl">
            <span className="block">Others record a walkthrough.</span>
            <span className="block bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              Pit Crew makes your pitch.
            </span>
          </h1>
          <p className="max-w-xl text-lg text-slate-400">
            Paste your project&apos;s live link. You get a narrated pitch video with a real recorded
            demo, submission text and a Build Log draft, with every statistic checked against its
            source.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#make" className="btn px-5 py-3">
              Make my pitch video
            </a>
            <a href="#samples" className="btn-ghost px-5 py-3">
              Watch a sample
            </a>
          </div>
          {s.videos_made > 0 && (
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-200">{s.videos_made}</span> video
              {s.videos_made === 1 ? "" : "s"} made for{" "}
              <span className="font-semibold text-slate-200">{s.unique_projects}</span> project
              {s.unique_projects === 1 ? "" : "s"} so far
            </p>
          )}
        </div>
        <div className="relative">
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br sm:-inset-6 from-indigo-500/20 to-fuchsia-500/10 blur-2xl" />
          <video
            className="relative aspect-video w-full rounded-2xl border border-white/10 bg-black shadow-2xl"
            src="/samples/tldraw.mp4"
            poster="/samples/tldraw.jpg"
            controls
            playsInline
            preload="none"
          />
          <p className="relative mt-2 text-xs text-slate-500">
            Sample: made by Pit Crew from tldraw.com, unedited. Turn the sound on.
          </p>
        </div>
      </section>

      {/* What you get */}
      <section className="space-y-8">
        <div className="space-y-2">
          <p className="eyebrow">What you get</p>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            A whole submission kit, not just a screen recording
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GETS.map((g) => (
            <div key={g.t} className="card">
              <h3 className="font-semibold text-white">{g.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{g.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Samples */}
      <section id="samples" className="scroll-mt-24 space-y-8">
        <div className="space-y-2">
          <p className="eyebrow">Samples</p>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Real output, straight from a live link
          </h2>
          <p className="max-w-2xl text-slate-400">
            No editing afterwards. Both came from pasting a URL; the agent wrote the script and
            picked the look.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {SAMPLES.map((v) => (
            <figure key={v.file} className="card space-y-3 p-3 sm:p-3">
              <video
                className="aspect-video w-full rounded-xl bg-black"
                src={`/samples/${v.file}.mp4`}
                poster={`/samples/${v.file}.jpg`}
                controls
                playsInline
                preload="none"
              />
              <figcaption className="px-2 pb-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-white">{v.name}</span>
                  <span className="text-xs text-slate-500">
                    {v.url} · {v.kit} look
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{v.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Looks */}
      <section className="space-y-8">
        <div className="space-y-2">
          <p className="eyebrow">Not one template</p>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Eight looks. The agent picks the one that fits your product, or you do.
          </h2>
          <p className="max-w-2xl text-slate-400">
            Each look changes the typeface, motion, colours, transitions, browser window, captions and
            ending, all built around your brand colour. Pick one in the form, or leave it to the agent.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KITS.map((k) => (
            <figure
              key={k.id}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <div className="relative aspect-video">
                <Image
                  src={`/kits/${k.id}.jpg`}
                  alt={`${k.label} look: title scene`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-300 group-hover:opacity-0"
                />
                <Image
                  src={`/kits/${k.id}-demo.jpg`}
                  alt={`${k.label} look: demo scene`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover opacity-0 transition duration-300 group-hover:opacity-100"
                />
              </div>
              <figcaption className="flex items-baseline justify-between px-4 py-3">
                <span className="font-semibold text-white">{k.label}</span>
                <span className="text-xs text-slate-500">{k.fit}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Hover a look to see its demo scene. All eight stills are rendered from the same tldraw plan.
        </p>
      </section>

      {/* How */}
      <section id="how" className="scroll-mt-24 space-y-8">
        <div className="space-y-2">
          <p className="eyebrow">How it works</p>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            An agent directs it. Our server makes sure it&apos;s true.
          </h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-2">
          {HOW.map((h, i) => (
            <li key={h.t} className="card flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-white">{h.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{h.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Form */}
      <section id="make" className="scroll-mt-24 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <p className="eyebrow">Make yours</p>
          <h2 className="text-3xl font-bold tracking-tight text-white">Paste your link</h2>
          <ul className="space-y-3 text-sm text-slate-400">
            <li>
              <span className="font-semibold text-slate-200">About 10 minutes.</span> Leave the page
              open; you can watch every step live.
            </li>
            <li>
              <span className="font-semibold text-slate-200">Public pages only.</span> We never log
              in, sign up or submit forms on your site. Login-walled apps get their public pages.
            </li>
            <li>
              <span className="font-semibold text-slate-200">Statistics only with a source.</span>{" "}
              If no number is checkably about your problem, the video has none.
            </li>
            <li>
              <span className="font-semibold text-slate-200">You stay the editor.</span> Narration
              only describes what&apos;s on your site or in your fields. Watch it before you submit,
              and ask for a revision in plain words.
            </li>
          </ul>
        </div>
        <JobForm />
      </section>
    </div>
  );
}
