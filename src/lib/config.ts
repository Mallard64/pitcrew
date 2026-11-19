import path from "node:path";

const int = (v: string | undefined, d: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  get dataDir() {
    return path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "./data");
  },
  get maxJobsPerHour() {
    return int(process.env.MAX_JOBS_PER_HOUR, 30);
  },
  get maxJobsPerUserPerDay() {
    return int(process.env.MAX_JOBS_PER_USER_PER_DAY, 5);
  },
  /** Stripe Payment Link shown when a team hits its daily limit (only buy.stripe.com links; empty = none). */
  get stripePaymentLink() {
    const u = process.env.STRIPE_PAYMENT_LINK ?? "";
    return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(u) ? u : "";
  },
  get maxJobsPerDay() {
    return int(process.env.MAX_JOBS_PER_DAY, 200);
  },
  get maxConcurrentJobs() {
    return int(process.env.MAX_CONCURRENT_JOBS, 2);
  },
  get jobTimeoutMs() {
    return int(process.env.JOB_TIMEOUT_MS, 10 * 60 * 1000);
  },
  /** Pitch Room (3 drafts + judge) is off until verified in production. */
  get pitchRoomEnabled() {
    return process.env.PITCH_ROOM_ENABLED === "true";
  },
  /** Landing-page pilot line: hidden until PILOT_PARTNER_ENABLED=true and both values are set. */
  get pilotPartner() {
    const size = int(process.env.PILOT_PARTNER_SIZE, 0);
    const season = (process.env.PILOT_PARTNER_SEASON ?? "").trim();
    return process.env.PILOT_PARTNER_ENABLED === "true" && size && season ? { size, season } : null;
  },
  /** Paid count and dollars collected aren't in our DB (Stripe holds them), so they're set by hand from the Stripe dashboard. Unset = hidden. */
  get paidTraction() {
    const paid = int(process.env.TRACTION_PAID_COUNT, 0);
    const usd = int(process.env.TRACTION_COLLECTED_USD, 0);
    return paid && usd ? { paid, usd } : null;
  },
  /** Public link to our HarnessRouter build log thread (empty = no link). */
  get buildLogUrl() {
    const u = process.env.BUILD_LOG_URL ?? "";
    return /^https:\/\//.test(u) ? u : "";
  },
  get adminToken() {
    return process.env.ADMIN_TOKEN ?? "";
  },
};
