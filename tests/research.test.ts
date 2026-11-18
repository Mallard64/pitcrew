import { describe, expect, it } from "vitest";
import {
  checkStatInText,
  htmlToText,
  scrubUnbackedNumbers,
  sourcesMarkdown,
  verifyResearch,
} from "../src/lib/research/verify";
import { sanitizePlan } from "../src/lib/pipeline";
import { VideoPlanSchema, type VideoPlan } from "../harness/schemas/video_plan";

const PAGE = htmlToText(
  `<html><head><style>.x{}</style><script>var n = 99;</script></head><body>
   <p>A 2023 survey found that 64&nbsp;percent of students miss at least one deadline per term.</p>
   <p>Teams spend 1,200 hours a year on admin. Growth was 3.5x.</p></body></html>`,
);

function plan(overrides: Partial<VideoPlan> = {}): VideoPlan {
  return VideoPlanSchema.parse({
    version: 1,
    seed: 1,
    style_kit: "default",
    brand: { primary: "#336699" },
    size: { width: 1280, height: 720 },
    fps: 30,
    credit: true,
    scenes: [
      {
        id: "problem",
        section: "problem",
        layout: "stat-reveal",
        duration_s: 12,
        narration:
          "Students juggle many deadlines. 64% of them miss at least one each term. And 80% give up on planners.",
        elements: [
          { type: "kinetic_headline", text: "Deadlines slip through the cracks" },
          {
            type: "stat",
            source_id: "src1",
            value: 64,
            unit: "%",
            label: "of students miss a deadline each term",
          },
        ],
        transition_in: "fade",
      },
      {
        id: "end",
        section: "end",
        layout: "end-card",
        duration_s: 3,
        narration: "",
        elements: [],
        transition_in: "fade",
      },
    ],
    flow: {
      project_name: "P",
      url: "https://example.com",
      viewport: { width: 1280, height: 720 },
      steps: [{ id: "s1", action: "wait", hold_ms: 3000, say: "hi" }],
    },
    sources: [
      {
        id: "src1",
        stat: "64%",
        claim_text: "64% of students miss a deadline each term",
        source_name: "Example Survey",
        url: "https://stats.example.org/report",
        year: 2023,
        quote: "64 percent of students",
        verified: false,
        kind: "research",
      },
    ],
    ...overrides,
  });
}

describe("statistic matching", () => {
  it("strips scripts/styles and decodes entities", () => {
    expect(PAGE).not.toContain("var n");
    expect(PAGE).toContain("64 percent of students");
  });
  it("matches number and unit in the forms pages use", () => {
    expect(checkStatInText(PAGE, 64, "%").ok).toBe(true); // "64 percent"
    expect(checkStatInText(PAGE, 1200, "hours").ok).toBe(true); // "1,200 hours"
    expect(checkStatInText(PAGE, 3.5, "x").ok).toBe(true);
  });
  it("rejects a different number, a partial number or a missing unit", () => {
    expect(checkStatInText(PAGE, 65, "%").ok).toBe(false);
    expect(checkStatInText(PAGE, 4, "%").ok).toBe(false); // must not match inside 64
    expect(checkStatInText(PAGE, 1200, "%").ok).toBe(false); // right number, wrong unit
    expect(checkStatInText(PAGE, 2023, "%").ok).toBe(false);
  });
});

describe("verifyResearch + sanitizePlan", () => {
  it("keeps a stat found on its page, records the real excerpt and scrubs other numbers", async () => {
    const p = plan();
    const notes = await verifyResearch(p, async () => PAGE);
    expect(notes.join()).toMatch(/Verified/);
    expect(p.sources[0].verified).toBe(true);
    expect(p.sources[0].quote).toContain("64 percent of students miss");
    sanitizePlan(p, new Set(), "/nonexistent");
    const problem = p.scenes.find((s) => s.id === "problem")!;
    expect(problem.elements.some((e) => e.type === "stat")).toBe(true);
    // "80%" had no source, so its sentence goes; the verified 64% sentence stays.
    expect(problem.narration).toContain("64%");
    expect(problem.narration).not.toContain("80%");
    expect(sourcesMarkdown("P", p.sources)).toContain("https://stats.example.org/report");
  });

  it("drops the stat, its narration and its source when the page doesn't contain the number", async () => {
    const p = plan();
    const notes = await verifyResearch(
      p,
      async () => "This page talks about deadlines but has no such number.",
    );
    expect(notes.join()).toMatch(/not found/);
    sanitizePlan(p, new Set(), "/nonexistent");
    const problem = p.scenes.find((s) => s.id === "problem")!;
    expect(problem.elements.some((e) => e.type === "stat")).toBe(false);
    expect(problem.narration).toBe("Students juggle many deadlines.");
    expect(p.sources).toHaveLength(0);
    expect(sourcesMarkdown("P", p.sources)).toMatch(/no statistics/);
  });

  it("treats a fetch failure as unverified", async () => {
    const p = plan();
    await verifyResearch(p, async () => {
      throw new Error("HTTP 403");
    });
    expect(p.sources[0].verified).toBe(false);
  });

  it("drops a problem scene left with nothing verifiable", () => {
    const p = plan();
    p.scenes[0].narration = "42% of people hate this.";
    p.scenes[0].elements = [{ type: "stat", source_id: "src1", value: 42, unit: "%", label: "x" }];
    sanitizePlan(p, new Set(), "/nonexistent");
    expect(p.scenes.map((s) => s.id)).toEqual(["end"]);
  });

  it("scrubUnbackedNumbers leaves non-problem scenes alone", () => {
    const p = plan();
    p.scenes[1].narration = "Over 50 integrations.";
    scrubUnbackedNumbers(p, []);
    expect(p.scenes[1].narration).toBe("Over 50 integrations.");
  });
});

describe("research search candidates", async () => {
  const { statSentences, findCandidates, researchPrompt } = await import("../src/lib/research/search");
  it("keeps whole sentences with decimals and skips headline soup", () => {
    const text =
      "Intro text here. The survey of 476 companies found that 21.6% of respondents used whiteboard apps, while 23.3% plan to deploy them. " +
      "Latest News From The Team About Our 2027 Roadmap And 45% More Features Today For You. We like cookies and 50% of them.";
    const s = statSentences(text);
    expect(s[0]).toBe("The survey of 476 companies found that 21.6% of respondents used whiteboard apps, while 23.3% plan to deploy them.");
    expect(s.join(" ")).not.toMatch(/Roadmap|cookies/);
  });
  it("searches, skips social sites and PDFs, and numbers the candidates", async () => {
    const search = async () => [
      { url: "https://www.reddit.com/r/x", title: "r" },
      { url: "https://stats.example.org/report.pdf", title: "pdf" },
      { url: "https://stats.example.org/report", title: "Report" },
    ];
    const fetched: string[] = [];
    const c = await findCandidates(["q1", "q2"], {
      search,
      fetchText: async (u) => {
        fetched.push(u);
        return "A national survey found that 64 percent of students miss at least one deadline per term.";
      },
    });
    expect(fetched).toEqual(["https://stats.example.org/report"]); // deduped across queries
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: "c1", url: "https://stats.example.org/report" });
    expect(researchPrompt(c)).toContain("[c1]");
  });
});

describe("source year", () => {
  it("keeps the year only when the page states it near the number", async () => {
    const p = plan();
    await verifyResearch(p, async () => PAGE); // PAGE says "A 2023 survey found that 64 percent..."
    expect(p.sources[0].year).toBe(2023);
    const q = plan();
    q.sources[0].year = 2026;
    const notes = await verifyResearch(q, async () => PAGE + " " + "filler ".repeat(400) + "© 2026");
    expect(q.sources[0].year).toBe(0);
    expect(notes.join()).toMatch(/citing without a year/);
    expect(sourcesMarkdown("P", q.sources)).toContain("- Example Survey: <https://stats.example.org/report>");
  });
});
