
import "dotenv/config";
import { pool } from "./pool";

async function main() {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS server_time"
    );

    console.log("PostgreSQL connection successful!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("PostgreSQL connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
