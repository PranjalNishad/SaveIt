// QUEUE.TS — Background job queue settings
// These control how the download queue behaves.
// The queue handles YouTube downloads in the background.

export const QUEUE = {
  // ── Internal name of the queue
  NAME: "video-download",
  JOB_NAME: "download",

  // ── How many times to retry a failed download automatically
  MAX_ATTEMPTS: 3,

  // ── Delay before first retry (milliseconds)
  RETRY_DELAY_MS: 3000,

  // ── How many downloads to process at the same time
  WORKER_CONCURRENCY: 5,

  // ── Max jobs per second across all workers
  RATE_LIMITER_MAX: 10,
  RATE_LIMITER_DURATION_MS: 1000,

  // ── How many completed jobs to keep in history
  KEEP_COMPLETED: 100,

  // ── How many failed jobs to keep in history
  KEEP_FAILED: 50,
} as const;
