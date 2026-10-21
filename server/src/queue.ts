
import { Queue } from "bullmq";
import IORedis from "ioredis";
import "dotenv/config";

export const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

export const checkQueue = new Queue("checks", {
  connection,
});

export async function scheduleMonitor(
  id: number,
  intervalSeconds: number
) {
  await checkQueue.upsertJobScheduler(
    `monitor-${id}`,
    { every: intervalSeconds * 1000 },
    { name: "check", data: { monitorId: id } }
  );
}

export async function unscheduleMonitor(id: number) {
  await checkQueue.removeJobScheduler(`monitor-${id}`);
}
