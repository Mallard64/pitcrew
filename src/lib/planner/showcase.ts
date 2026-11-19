/**
 * Offline plan for projects without a recordable live link (team footage or repo showcase), and the
 * fallback when the agent fails for them. Everything comes from the team's fields and the repo's own
 * README, images and manifests; sections without true content are omitted.
 */
import type { Scene, VideoPlan } from "../../../harness/schemas/video_plan";
import type { PlanRequest } from "../harness/types";
import { seedFor } from "../harness/local";

const firstProse = (md: string) =>
  md
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/[#>*_`|[\]]/g, "")
        .replace(/\(([^)]*)\)/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find((p) => p.split(" ").length >= 8 && !/^(!|http|npm |git |cd )/.test(p)) ?? "";
const sentence = (t: string, maxWords = 26) => {
  const s = (t.match(/[^.!?]+[.!?]/) ?? [t])[0].trim();
  const w = s.split(/\s+/);
  return w.length > maxWords ? w.slice(0, maxWords).join(" ") + "…" : s;
};
const seconds = (narration: string) =>
  Math.max(3, Math.round((narration.split(/\s+/).filter(Boolean).length / 2.6 + 1) * 10) / 10);

export function showcasePlan(req: PlanRequest): VideoPlan {
  const name = req.projectName;
  const repo = req.repo;
  const target = req.liveUrl || req.repoUrl || repo?.url || "https://github.com";
  const mode = req.footageClips?.length ? "footage" : "repo-showcase";
  const about = req.blurb || repo?.description || sentence(firstProse(repo?.readme.text ?? ""));
  const scenes: Scene[] = [];
  const add = (
    sc: Omit<Scene, "duration_s" | "transition_in" | "camera" | "motion"> & { duration_s?: number },
  ) =>
    scenes.push({
      transition_in: "fade",
      duration_s: sc.duration_s ?? seconds(sc.narration),
      ...sc,
    } as Scene);

  const problem = req.problem ? sentence(req.problem) : "";
  if (problem)
    add({
      id: "problem",
      section: "problem",
      layout: "big-statement",
      narration: problem,
      elements: [
        {
          type: "kinetic_headline",
          text: sentence(req.problem!, 12).replace(/[.…]$/, ""),
          animation: "word-by-word",
        },
      ],
    });
  add({
    id: "solution",
    section: "solution",
    layout: "big-statement",
    narration: about
      ? `${name}: ${about.replace(/^[A-Z]/, (c) => c.toLowerCase())}`
      : `This is ${name}.`,
    elements: [
      { type: "kinetic_headline", text: name, animation: "word-by-word" },
      ...(about
        ? [{ type: "text" as const, text: sentence(about, 18), role: "body" as const }]
        : []),
    ],
  });

  const steps: VideoPlan["flow"]["steps"] = [];
  if (mode === "footage")
    for (const c of req.footageClips!) {
      const say = c === req.footageClips![0] ? `Here is ${name} in the team's own footage.` : "";
      add({
        id: `demo_${c.id}`,
        section: "demo",
        layout: "full-frame",
        narration: say,
        duration_s: Math.max(c.duration_s, seconds(say)),
        elements: [{ type: "clip", step_id: c.id, zoom: "none" }],
      });
      steps.push({
        id: c.id,
        action: "goto",
        url: target,
        hold_ms: Math.min(8000, Math.max(1000, Math.round(c.duration_s * 1000))),
        say,
      });
    }
  else
    for (const [i, img] of (req.repoImages ?? []).slice(0, 4).entries()) {
      const say = img.alt
        ? `${img.alt.replace(/[.]$/, "")}, from the repository.`
        : `A screen from the repository.`;
      add({
        id: `demo_img${i + 1}`,
        section: "demo",
        layout: "full-frame",
        narration: say,
        elements: [{ type: "image", src: img.src, fit: "contain" }],
      });
      steps.push({
        id: `s${i + 1}`,
        action: "goto",
        url: target,
        hold_ms: 3000,
        say: say.split(/\s+/).slice(0, 25).join(" "),
      });
    }

  const stack = repo?.stack ?? [];
  if (stack.length || req.builtWith) {
    const narration = [
      stack.length ? `${name} is built with ${stack.slice(0, 5).join(", ")}.` : "",
      req.builtWith ? sentence(req.builtWith) : "",
    ]
      .filter(Boolean)
      .join(" ");
    add({
      id: "built",
      section: "built",
      layout: "big-statement",
      narration,
      elements: stack.length
        ? [
            {
              type: "diagram",
              kind: "hub-and-spoke",
              nodes: [
                { id: "app", label: name },
                ...stack.slice(0, 6).map((s, i) => ({ id: `n${i}`, label: s })),
              ],
              edges: stack.slice(0, 6).map((_, i) => ({ from: "app", to: `n${i}` })),
            },
          ]
        : [{ type: "text", text: sentence(req.builtWith!, 18), role: "body" }],
    });
  }

  const downloads = repo ? repo.releases.reduce((n, r) => n + r.downloads, 0) : 0;
  const signals = repo
    ? [
        repo.stars >= 10 ? `${repo.stars} GitHub stars` : "",
        repo.contributors >= 2 ? `${repo.contributors} contributors` : "",
        downloads >= 10 ? `${downloads} release downloads` : "",
      ].filter(Boolean)
    : [];
  if (req.evidence)
    add({
      id: "evidence",
      section: "evidence",
      layout: "bullet-reveal",
      narration: sentence(req.evidence, 30),
      elements: [
        {
          type: "bullets",
          items: req.evidence
            .split(/\n|;/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 4),
          animation: "slide-up",
        },
      ],
    });
  else if (signals.length)
    add({
      id: "evidence",
      section: "evidence",
      layout: "bullet-reveal",
      narration: `On GitHub, ${name} has ${signals.join(" and ")}.`,
      elements: [
        { type: "bullets", items: signals, animation: "slide-up" },
        {
          type: "text",
          text: `Source: ${repo!.url.replace("https://", "")}, ${repo!.fetchedAt}`,
          role: "label",
        },
      ],
    });

  const next = req.whatsNext
    ? req.whatsNext
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean)
    : (repo?.openIssues ?? []).slice(0, 3);
  if (next.length)
    add({
      id: "next",
      section: "next",
      layout: "bullet-reveal",
      narration: `Next: ${next.slice(0, 3).join("; ")}.`,
      elements: [{ type: "bullets", items: next.slice(0, 3), animation: "slide-up" }],
    });

  const ask = req.ask ? sentence(req.ask, 20) : `Try it at ${target.replace(/^https?:\/\//, "")}.`;
  add({
    id: "ask",
    section: "ask",
    layout: "big-statement",
    narration: ask,
    elements: [
      { type: "kinetic_headline", text: ask.replace(/[.]$/, ""), animation: "word-by-word" },
    ],
  });
  add({
    id: "end",
    section: "end",
    layout: "end-card",
    narration: "",
    duration_s: 3,
    elements: [],
  });

  if (!steps.length) steps.push({ id: "s1", action: "goto", url: target, hold_ms: 3000, say: "" });
  return {
    version: 1,
    seed: seedFor(target),
    style_kit: "default",
    brand: { primary: "#6366f1" },
    size: { width: 1920, height: 1080 },
    fps: 30,
    credit: true,
    scenes,
    flow: {
      project_name: name.slice(0, 80),
      url: target,
      viewport: { width: 1280, height: 720 },
      steps,
    },
    sources: [],
    demo_mode: mode,
  };
}
