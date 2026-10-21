
import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db/pool";
import monitorRoutes from "./routes/monitors";
import authRoutes from "./routes/auth";
import analyticsRoutes from "./routes/analytics";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());
app.use("/api/monitors", monitorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      service: "PulseCheck API",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);

    res.status(503).json({
      ok: false,
      service: "PulseCheck API",
      database: "disconnected",
    });
  }
});

app.listen(PORT, () => {
  console.log(`PulseCheck API running on port ${PORT}`);
});
