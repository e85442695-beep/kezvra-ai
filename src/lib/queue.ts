import { Queue } from "bullmq";
import { bullConnection } from "./redis";

export const QUEUES = { files: "kz-files", images: "kz-images", maintenance: "kz-maintenance" } as const;

const g = globalThis as unknown as { kzQueues?: Record<string, Queue> };
g.kzQueues ??= {};

export function queue(name: (typeof QUEUES)[keyof typeof QUEUES]) {
  g.kzQueues![name] ??= new Queue(name, {
    connection: bullConnection(),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return g.kzQueues![name]!;
}

export const enqueueFileProcessing = (fileId: string) => queue(QUEUES.files).add("process", { fileId }, { jobId: `file-${fileId}` });
export const enqueueImage = (generationId: string) => queue(QUEUES.images).add("generate", { generationId }, { jobId: `img-${generationId}`, attempts: 1 });
