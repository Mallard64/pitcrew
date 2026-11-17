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
  get maxJobsPerDay() {
    return int(process.env.MAX_JOBS_PER_DAY, 200);
  },
  get maxConcurrentJobs() {
    return int(process.env.MAX_CONCURRENT_JOBS, 2);
  },
  get jobTimeoutMs() {
    return int(process.env.JOB_TIMEOUT_MS, 10 * 60 * 1000);
  },
  get adminToken() {
    return process.env.ADMIN_TOKEN ?? "";
  },
};
