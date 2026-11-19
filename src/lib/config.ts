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
  get adminToken() {
    return process.env.ADMIN_TOKEN ?? "";
  },
};
