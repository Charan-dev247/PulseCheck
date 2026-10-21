import "dotenv/config";
import { checkQueue } from "./src/queue";

async function main() {
  const schedulers = await checkQueue.getJobSchedulers(0, 100, true);
  console.log(
    schedulers
      .filter((s) => s.key.includes("monitor-6"))
      .map((s) => ({
        key: s.key,
        every: s.every,
        next: s.next,
      }))
  );
  await checkQueue.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  await checkQueue.close();
  process.exit(1);
});
