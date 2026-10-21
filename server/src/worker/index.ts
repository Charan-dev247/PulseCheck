
import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "../queue";
import { pool } from "../db/pool";
import {
  sendOutageAlert,
  sendRecoveryAlert,
} from "../emailService";

async function runCheck(monitor: any) {
  const start = Date.now();

  try {
    const response = await fetch(monitor.url, {
      method: monitor.method,
      signal: AbortSignal.timeout(monitor.timeout_ms),
    });

    const responseMs = Date.now() - start;
    const success = response.status === monitor.expected_status;

    return {
      success,
      statusCode: response.status,
      responseMs,
      error: success ? null : `Unexpected status ${response.status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      statusCode: null,
      responseMs: Date.now() - start,
      error: error.message,
    };
  }
}

const worker = new Worker(
  "checks",
  async (job) => {
    const { rows } = await pool.query(
      "SELECT * FROM monitors WHERE id = $1 AND is_active = true",
      [job.data.monitorId]
    );

    const monitor = rows[0];
    if (!monitor) return;

    const result = await runCheck(monitor);

    await pool.query(
      `INSERT INTO check_results
       (monitor_id, success, status_code, response_ms, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        monitor.id,
        result.success,
        result.statusCode,
        result.responseMs,
        result.error,
      ]
    );

    if (result.success) {
      const wasDown = monitor.status === "down";

      await pool.query(
        `UPDATE monitors
         SET status = 'up', consecutive_failures = 0
         WHERE id = $1`,
        [monitor.id]
      );

      if (wasDown) {
        await pool.query(
          `UPDATE incidents
           SET resolved_at = now()
           WHERE monitor_id = $1 AND resolved_at IS NULL`,
          [monitor.id]
        );

        console.log(`Monitor ${monitor.id} recovered.`);

        await sendRecoveryAlert(monitor.name, monitor.url);
      }
    } else {
      const failures = monitor.consecutive_failures + 1;

      await pool.query(
        `UPDATE monitors
         SET consecutive_failures = $1
         WHERE id = $2`,
        [failures, monitor.id]
      );

      if (
        failures >= monitor.failure_threshold &&
        monitor.status !== "down"
      ) {
        await pool.query(
          "UPDATE monitors SET status = 'down' WHERE id = $1",
          [monitor.id]
        );

        await pool.query(
          "INSERT INTO incidents (monitor_id, reason) VALUES ($1, $2)",
          [monitor.id, result.error]
        );

        console.log(`Incident opened for monitor ${monitor.id}.`);

        await sendOutageAlert(
          monitor.name,
          monitor.url,
          result.error ?? "Unknown error"
        );
      }
    }
  },
  { connection, concurrency: 10 }
);

worker.on("completed", (job) => {
  console.log(`Check job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Check job ${job?.id} failed:`, error.message);
});

console.log("PulseCheck monitoring worker running.");
