import "dotenv/config";
import { pool } from "./src/db/pool";

async function main() {
  const result = await pool.query(`
    SELECT current_database() AS database,
           current_user AS username,
           inet_server_addr() AS server_address,
           inet_server_port() AS server_port
  `);

  console.log(result.rows[0]);

  const incidents = await pool.query(
    "SELECT id, monitor_id, started_at, resolved_at FROM incidents WHERE monitor_id = 6 ORDER BY started_at DESC"
  );

  console.log("Monitor 6 incidents:", incidents.rows);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
