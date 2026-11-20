import "dotenv/config";
import { Worker, type Job } from "bullmq";
import * as Sentry from "@sentry/nextjs";
import { bullConnection } from "@/lib/redis";
import { QUEUES, queue } from "@/lib/queue";
import { db } from "@/lib/db";
import { logger, errorInfo } from "@/lib/logger";
import { expireStaleReservations } from "@/lib/credits/ledger";
import { syncModels } from "@/lib/openrouter/models";
import { env } from "@/lib/env";
import { processFile, runImageGeneration } from "./jobs";

/**
 * Kezvra background worker (run as a separate process/container: `pnpm worker`).
 * Graceful shutdown: on SIGTERM/SIGINT workers stop taking jobs, finish the current ones, then exit.
 */
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.05 });

const log = logger.child({ service: "kezvra-worker" });

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  [QUEUES.files]: (job) => processFile(job.data.fileId),
  [QUEUES.images]: (job) => runImageGeneration(job.data.generationId),
  [QUEUES.maintenance]: async (job) => {
    switch (job.name) {
      case "expire-reservations":
        return { released: await expireStaleReservations() };
      case "sync-models":
        return syncModels();
      case "purge-deleted": {
        // Data-retention policy: hard-delete accounts 30 days after deletion request.
        const cutoff = new Date(Date.now() - 30 * 86_400_000);
        const users = await db.user.findMany({ where: { status: "DELETED", deletedAt: { lt: cutoff }, NOT: { email: { startsWith: "deleted-" } } }, select: { id: true }, take: 100 });
        for (const u of users) {
          await db.user.update({ where: { id: u.id }, data: { email: `deleted-${u.id}@invalid`, name: null, image: null, passwordHash: null, signupIp: null } });
        }
        const logs = await db.errorLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
        return { anonymized: users.length, errorLogsPurged: logs.count };
      }
      default:
        return null;
    }
  },
};

const concurrency: Record<string, number> = { [QUEUES.files]: 4, [QUEUES.images]: 3, [QUEUES.maintenance]: 1 };

const workers = Object.entries(handlers).map(([name, fn]) => {
  const w = new Worker(name, fn, { connection: bullConnection(), concurrency: concurrency[name] ?? 1 });
  w.on("failed", (job, err) => {
    log.error({ queue: name, jobId: job?.id, err: errorInfo(err) }, "job failed");
    Sentry.captureException(err);
  });
  w.on("completed", (job) => log.debug({ queue: name, jobId: job.id }, "job completed"));
  return w;
});

async function schedule() {
  const q = queue(QUEUES.maintenance);
  await q.upsertJobScheduler("expire-reservations", { every: 60_000 }, { name: "expire-reservations" });
  await q.upsertJobScheduler("sync-models", { pattern: "0 */6 * * *" }, { name: "sync-models" });
  await q.upsertJobScheduler("purge-deleted", { pattern: "30 3 * * *" }, { name: "purge-deleted" });
}

schedule().then(() => log.info({ queues: Object.keys(handlers) }, "worker started"));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down worker");
  const timer = setTimeout(() => process.exit(1), 30_000);
  await Promise.allSettled(workers.map((w) => w.close()));
  await db.$disconnect();
  clearTimeout(timer);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
