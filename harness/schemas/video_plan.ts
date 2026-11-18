/**
 * The video plan: the contract between the agent (directing) and Remotion (rendering).
 * Vocabulary ids (layouts, transitions, kits, motions) are plain strings here; the plan
 * validator (C15) checks them against the registries as those grow (C12–C14).
 */
import { z } from "zod";
import { FlowSchema } from "./flow";

export const SectionSchema = z.enum(["problem", "solution", "demo", "next", "end"]);
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
  z.object({ type: z.literal("clip"), step_id: z.string().min(1), zoom: z.enum(["none", "target", "follow"]).default("target"), speed: z.number().positive().optional() }),
  z.object({ type: z.literal("arrow"), from: z.string().min(1), to: z.string().min(1) }),
  z.object({ type: z.literal("node"), id: z.string().min(1), label: z.string().min(1), icon: z.string().optional() }),
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
  fps: z.literal(30),
  music: z.object({ track: z.string(), duck_db: z.number() }).nullable().optional(),
  credit: z.boolean().default(true),
  scenes: z.array(SceneSchema).min(1).max(20),
  flow: FlowSchema,
  sources: z.array(SourceSchema).default([]),
});

export type Section = z.infer<typeof SectionSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type VideoPlan = z.infer<typeof VideoPlanSchema>;
