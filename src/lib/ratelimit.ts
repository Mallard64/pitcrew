/** SQLite-backed rate limits: global per hour, global per day (budget cap), per client per day. */
import crypto from "node:crypto";
import { config } from "./config";
import { countRateEvents, recordRateEvent } from "./db";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const clientKeyFor = (ip: string) =>
  "ip:" + crypto.createHash("sha256").update(`${ip}|${config.adminToken || "pit-crew"}`).digest("hex").slice(0, 16);

export type RateResult = { ok: true } | { ok: false; reason: "busy" | "budget" | "user"; message: string };

/** Checks every limit and, if all pass, records the job against each key. */
export function takeJobSlot(keys: string[], now = Date.now()): RateResult {
  if (countRateEvents("global", now - DAY) >= config.maxJobsPerDay)
    return { ok: false, reason: "budget", message: "High demand: we've hit today's video budget. Please try again tomorrow." };
  if (countRateEvents("global", now - HOUR) >= config.maxJobsPerHour)
    return { ok: false, reason: "busy", message: "High demand right now. Please try again in a few minutes." };
  for (const k of keys)
    if (countRateEvents(k, now - DAY) >= config.maxJobsPerUserPerDay)
      return { ok: false, reason: "user", message: `You've made ${config.maxJobsPerUserPerDay} videos today, which is the daily limit.` };
  recordRateEvent("global", now);
  for (const k of keys) recordRateEvent(k, now);
  return { ok: true };
}
