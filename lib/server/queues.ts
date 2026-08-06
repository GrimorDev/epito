import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";

export type BackgroundQueue = "notifications" | "documents" | "integrations";

export type BackgroundJob = {
  tenantId: string;
  actorUserId: string | null;
  type:
    | "email.send"
    | "sms.send"
    | "push.send"
    | "pdf.generate"
    | "document.analyze"
    | "ksef.sync"
    | "payment.reconcile";
  payload: Record<string, unknown>;
  createdAt: string;
};

const queues = new Map<BackgroundQueue, Promise<Queue<BackgroundJob>>>();

async function createQueue(name: BackgroundQueue) {
  const connection = await getRedis();
  return new Queue<BackgroundJob>(name, {
    connection,
    prefix: "epito",
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 5_000 },
    },
  });
}

export function getBackgroundQueue(name: BackgroundQueue) {
  let queue = queues.get(name);
  if (!queue) {
    queue = createQueue(name);
    queues.set(name, queue);
  }
  return queue;
}

export async function enqueueBackgroundJob(
  queueName: BackgroundQueue,
  job: BackgroundJob,
  options: JobsOptions = {},
) {
  const queue = await getBackgroundQueue(queueName);
  return queue.add(job.type, job, {
    ...options,
    jobId: options.jobId,
  });
}
