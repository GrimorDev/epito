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
    | "invoice.issue"
    | "payment.reconcile"
    | "whitelist.verify"
    | "payment.remind"
    | "lead.notify";
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

const DEFAULT_KSEF_POLL_INTERVAL_MS = 10 * 60 * 1000;

function ksefPollIntervalMs(): number {
  const raw = Number(process.env.KSEF_POLL_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_KSEF_POLL_INTERVAL_MS;
}

export async function scheduleKsefSync(connectionId: string, tenantId: string, actorUserId: string | null) {
  const queue = await getBackgroundQueue("integrations");
  await queue.upsertJobScheduler(
    `ksef-poll-${connectionId}`,
    { every: ksefPollIntervalMs() },
    {
      name: "ksef.sync",
      data: {
        tenantId,
        actorUserId,
        type: "ksef.sync",
        payload: { connectionId },
        createdAt: new Date().toISOString(),
      } satisfies BackgroundJob,
    },
  );
}

export async function unscheduleKsefSync(connectionId: string) {
  const queue = await getBackgroundQueue("integrations");
  await queue.removeJobScheduler(`ksef-poll-${connectionId}`);
}

export async function enqueueInvoiceIssue(invoiceId: string, tenantId: string, actorUserId: string | null) {
  await enqueueBackgroundJob("integrations", {
    tenantId,
    actorUserId,
    type: "invoice.issue",
    payload: { invoiceId },
    createdAt: new Date().toISOString(),
  });
}

export async function enqueueWhitelistVerify(documentId: string, tenantId: string, actorUserId: string | null) {
  await enqueueBackgroundJob("integrations", {
    tenantId,
    actorUserId,
    type: "whitelist.verify",
    payload: { documentId },
    createdAt: new Date().toISOString(),
  });
}

// The marketing site's pilot-request form has no session/tenant — this is
// the only enqueue call in the app that runs for a genuinely anonymous
// visitor. tenantId is set to "" (not omitted) to satisfy BackgroundJob's
// shape; handleLeadNotify never touches app.current_tenant_id.
export async function enqueueLeadNotification(payload: { name: string; email: string; companiesRange: string }) {
  await enqueueBackgroundJob("integrations", {
    tenantId: "",
    actorUserId: null,
    type: "lead.notify",
    payload,
    createdAt: new Date().toISOString(),
  });
}
