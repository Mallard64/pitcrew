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
  /** Landing-page organizer line: shown only when PILOT_PARTNER_ENABLED=true. ORGANIZER_LINE overrides the default text. */
  get organizerLine() {
    if (process.env.PILOT_PARTNER_ENABLED !== "true") return "";
    return (
      (process.env.ORGANIZER_LINE ?? "").trim() ||
      "Our first organizer customer: an upcoming student hackathon is giving Pit Crew to every team."
    );
  },
  /** Optional https link for the organizer line (e.g. the event page). */
  get organizerUrl() {
    const u = (process.env.ORGANIZER_URL ?? "").trim();
    return /^https:\/\/[^\s"<>]+$/.test(u) ? u : "";
  },
  /**
   * Payments aren't in our DB (Stripe holds them), so these are set by hand from the Stripe dashboard. Unset = hidden.
   * TRACTION_COLLECTED_USD / TRACTION_PAID_COUNT are money actually received and the people who paid it.
   * TRACTION_ORGANIZER_USD is an organizer's commitment; set TRACTION_ORGANIZER_RECEIVED=true only once that money has arrived
   * (and include it in the collected total and paid count).
   */
  get paidTraction() {
    const paid = int(process.env.TRACTION_PAID_COUNT, 0);
    const usd = int(process.env.TRACTION_COLLECTED_USD, 0);
    const organizerUsd = int(process.env.TRACTION_ORGANIZER_USD, 0);
    const organizerReceived = process.env.TRACTION_ORGANIZER_RECEIVED === "true";
    return paid && usd ? { paid, usd, organizerUsd, organizerReceived } : null;
  },
  /**
   * Builder count as reported by the team (e.g. "5+"). The DB counts distinct hashed IPs, which undercounts
   * teammates sharing one network. Only digits with an optional "+"; unset = use the DB count.
   */
  get buildersReported() {
    const v = (process.env.TRACTION_BUILDERS ?? "").trim();
    return /^\d+\+?$/.test(v) ? v : "";
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
