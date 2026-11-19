/**
 * Demo repair: when recorded steps fail (usually a selector that doesn't match the live page), the
 * agent gets one follow-up turn with the error and the elements that really were on the page, fixes
 * only those steps, and the server records the flow once more. Narration (say) never changes here.
 */
import { StepSchema, type Flow, type Step } from "../../harness/schemas/flow";
import type { StepTiming } from "../../harness/scripts/record_flow";

/** Steps worth repairing: clicks and types that failed (a failed goto is the site, not the selector). */
export function repairableFailures(flow: Flow, timings: StepTiming[]) {
  const byId = new Map(flow.steps.map((s) => [s.id, s]));
  return timings
    .filter((t) => !t.ok && ["click", "type"].includes(byId.get(t.step_id)?.action ?? ""))
    .map((t) => ({ step: byId.get(t.step_id)!, error: t.error ?? "failed", candidates: t.candidates ?? [] }));
}

export function repairPrompt(failures: ReturnType<typeof repairableFailures>) {
  const lines = failures.map(
    (f) =>
      `- ${f.step.id} (${f.step.action} ${f.step.selector}${f.step.text ? `, text "${f.step.text}"` : ""}) failed: ${f.error.slice(0, 160)}\n` +
      `  Elements on the page at that moment (Playwright selectors): ${f.candidates.length ? f.candidates.slice(0, 40).join(" | ") : "(none found)"}`,
  );
  return [
    "Demo repair. Our server recorded your flow in Chromium and these steps failed:",
    lines.join("\n"),
    "Fix only these steps. Prefer a selector from the list that does what the step's say describes; if none fits, use a goto to a page URL you know shows it.",
    "Keep each step's id, say and hold_ms. Change nothing else in the plan.",
    "Reply with the full JSON block again (same format as before).",
  ].join("\n\n");
}

/**
 * Takes repaired versions of the failed steps only (same id, valid step, same say), leaving every
 * other step as it was. Returns the new flow and how many steps changed.
 */
export function mergeRepairedSteps(flow: Flow, repaired: Flow, failedIds: string[]): { flow: Flow; changed: number } {
  const fix = new Map(repaired.steps.map((s) => [s.id, s]));
  let changed = 0;
  const steps = flow.steps.map((s): Step => {
    if (!failedIds.includes(s.id)) return s;
    const r = fix.get(s.id);
    if (!r) return s;
    const next = StepSchema.safeParse({ ...r, id: s.id, say: s.say, hold_ms: s.hold_ms });
    if (!next.success) return s;
    const same = next.data.action === s.action && next.data.selector === s.selector && next.data.url === s.url && next.data.text === s.text;
    if (same) return s;
    changed++;
    return next.data;
  });
  return { flow: { ...flow, steps }, changed };
}
