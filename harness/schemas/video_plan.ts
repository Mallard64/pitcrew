/**
 * The video plan: the contract between the agent (directing) and Remotion (rendering).
 * Vocabulary ids (layouts, transitions, kits, motions) are plain strings here; the plan
 * validator (C15) checks them against the registries as those grow (C12–C14).
 */
import { z } from "zod";
import { FlowSchema } from "./flow";

/**
 * The pitch outline: problem → solution → demo → evidence → built (how it's built) → next → ask → end.
 * Evidence, built, next and ask are omitted when there is nothing true to say.
 */
export const SectionSchema = z.enum(["problem", "solution", "demo", "evidence", "built", "next", "ask", "end"]);
/** Where the demo footage comes from (shown on screen and in the output contract). */
export const DemoModeSchema = z.enum(["live", "sandbox-run", "cli-run", "footage", "repo-showcase"]);
export const TextAnimSchema = z.enum(["none", "word-by-word", "slide-up", "typewriter", "highlight-sweep"]);

export const SourceSchema = z.object({
  id: z.string().min(1),
  stat: z.string().min(1),
  claim_text: z.string(),
  source_name: z.string().min(1),
  url: z.string().url(),
  year: z.number().int(),
  quote: z.string(),
  verified: z.boolean(),
  kind: z.enum(["research", "team-provided"]),
});

const NodeSchema = z.object({ id: z.string().min(1), label: z.string().min(1), icon: z.string().optional(), group: z.string().optional() });
const EdgeSchema = z.object({ from: z.string().min(1), to: z.string().min(1), label: z.string().optional() });

const BaseElements = [
  z.object({ type: z.literal("text"), text: z.string().min(1), role: z.enum(["title", "body", "label"]) }),
  z.object({ type: z.literal("kinetic_headline"), text: z.string().min(1), animation: TextAnimSchema.default("word-by-word") }),
  z.object({ type: z.literal("stat"), source_id: z.string().min(1), value: z.number(), unit: z.string().optional(), label: z.string() }),
  z.object({ type: z.literal("icon"), name: z.string().min(1) }),
  z.object({ type: z.literal("shape"), shape: z.enum(["circle", "rect", "blob"]) }),
  z.object({ type: z.literal("image"), src: z.string().min(1), fit: z.enum(["cover", "contain"]).default("contain") }),
  z.object({ type: z.literal("clip"), step_id: z.string().min(1), zoom: z.enum(["none", "target", "follow", "inspect"]).default("target"), speed: z.number().positive().optional() }),
  z.object({ type: z.literal("arrow"), from: z.string().min(1), to: z.string().min(1) }),
  z.object({ type: z.literal("node"), id: z.string().min(1), label: z.string().min(1), icon: z.string().optional() }),
  // A few lines of a repository file. The agent gives path + line range; the server fills `lines` from GitHub.
  z.object({
    type: z.literal("code"),
    path: z.string().min(1).max(200),
    from: z.number().int().min(1),
    to: z.number().int().min(1),
    highlight: z.tuple([z.number().int(), z.number().int()]).optional(),
    lines: z.array(z.string()).max(40).optional(),
  }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string().min(1)).min(1).max(5), animation: TextAnimSchema.default("slide-up") }),
  z.object({
    type: z.literal("diagram"),
    kind: z.enum(["flow", "layered", "hub-and-spoke", "before-after", "timeline"]),
    nodes: z.array(NodeSchema).min(1).max(12),
    edges: z.array(EdgeSchema),
    groups: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  }),
] as const;

type BaseElement = z.infer<(typeof BaseElements)[number]>;
export type Element = BaseElement | { type: "device_frame"; device: "browser" | "laptop" | "phone"; child: Element };

export const ElementSchema: z.ZodType<Element> = z.lazy(() =>
  z.union([
    ...BaseElements,
    z.object({ type: z.literal("device_frame"), device: z.enum(["browser", "laptop", "phone"]), child: ElementSchema }),
  ]),
) as z.ZodType<Element>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  section: SectionSchema,
  layout: z.string().min(1),
  duration_s: z.number().min(1).max(60),
  narration: z.string(),
  elements: z.array(ElementSchema),
  transition_in: z.string().min(1).default("fade"),
  camera: z.string().nullable().optional(),
  motion: z.string().optional(),
});

export const VideoPlanSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().nonnegative(),
  style_kit: z.string().min(1),
  brand: z.object({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/), font: z.string().optional() }),
  size: z.union([z.object({ width: z.literal(1280), height: z.literal(720) }), z.object({ width: z.literal(1920), height: z.literal(1080) })]),
  // The agent plans at 30; the renderer may output 60 (animations are fps-independent).
  fps: z.union([z.literal(30), z.literal(60)]),
  music: z.object({ track: z.string(), duck_db: z.number() }).nullable().optional(),
  credit: z.boolean().default(true),
  /** Set by the server: where the demo comes from. Absent = live (older plans). */
  demo_mode: DemoModeSchema.optional(),
  /** Set by the server for sensitive topics (health, mental health, finance, legal, children). */
  disclaimer: z.string().max(80).optional(),
  /** Set by the server when the team picked a length (seconds); absent means the default 60–90s. */
  target_s: z.number().int().min(30).max(180).optional(),
  scenes: z.array(SceneSchema).min(1).max(20),
  flow: FlowSchema,
  sources: z.array(SourceSchema).default([]),
});

export type Section = z.infer<typeof SectionSchema>;
export type DemoMode = z.infer<typeof DemoModeSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type VideoPlan = z.infer<typeof VideoPlanSchema>;
