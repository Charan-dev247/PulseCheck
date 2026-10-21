
import { Router } from "express";
import { pool } from "../db/pool";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth";

const router = Router();

// GET /api/analytics/summary
// Summary metrics based on checks recorded in the last 24 hours.
router.get(
  "/summary",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const result = await pool.query(
        `WITH user_monitors AS (
           SELECT id, status, is_active
           FROM monitors
           WHERE user_id = $1
         ),
         active_monitors AS (
           SELECT id, status
           FROM user_monitors
           WHERE is_active = true
         ),
         recent_checks AS (
           SELECT cr.success, cr.response_ms
           FROM check_results cr
           JOIN user_monitors m ON m.id = cr.monitor_id
           WHERE cr.checked_at >= NOW() - INTERVAL '24 hours'
         )
         SELECT
           (SELECT COUNT(*)::int FROM user_monitors)
             AS total_monitors,
           (SELECT COUNT(*)::int FROM active_monitors WHERE status = 'up')
             AS up_monitors,
           (SELECT COUNT(*)::int FROM active_monitors WHERE status = 'down')
             AS down_monitors,
           (SELECT COUNT(*)::int FROM active_monitors WHERE status = 'unknown')
             AS unknown_monitors,
           (SELECT COUNT(*)::int FROM user_monitors WHERE is_active = false)
             AS paused_monitors,
           (SELECT ROUND(AVG(response_ms) FILTER (WHERE success = true), 2)
            FROM recent_checks) AS avg_response_ms,
           (SELECT COUNT(*)::int FROM recent_checks) AS total_checks,
           (SELECT COUNT(*)::int FROM recent_checks WHERE success = true)
             AS successful_checks,
           (SELECT ROUND(
             100.0 * COUNT(*) FILTER (WHERE success = true)
             / NULLIF(COUNT(*), 0), 2
           ) FROM recent_checks) AS success_rate_percent`,
        [req.userId]
      );

      return res.json(result.rows[0]);
    } catch (error) {
      console.error("Analytics summary failed:", error);
      return res.status(500).json({
        error: "Unable to load analytics summary",
      });
    }
  }
);

// GET /api/analytics/:id/history
// Return the latest 100 check records for a monitor owned by this user.
router.get(
  "/:id/history",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const monitorId = Number(req.params.id);

    if (!Number.isSafeInteger(monitorId) || monitorId <= 0) {
      return res.status(400).json({ error: "Invalid monitor ID" });
    }

    try {
      const result = await pool.query(
        `SELECT
           cr.id,
           cr.success,
           cr.status_code,
           cr.response_ms,
           cr.error,
           cr.checked_at
         FROM check_results cr
         JOIN monitors m ON m.id = cr.monitor_id
         WHERE m.id = $1 AND m.user_id = $2
         ORDER BY cr.checked_at DESC
         LIMIT 100`,
        [monitorId, req.userId]
      );

      return res.json({ history: result.rows });
    } catch (error) {
      console.error("Monitor history failed:", error);
      return res.status(500).json({
        error: "Unable to load monitor history",
      });
    }
  }
);

// GET /api/analytics/:id/uptime?period=24h|7d|30d
// Calculates recorded-check success rate, not elapsed-time uptime.
router.get(
  "/:id/uptime",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const monitorId = Number(req.params.id);
    const period = String(req.query.period ?? "24h");

    if (!Number.isSafeInteger(monitorId) || monitorId <= 0) {
      return res.status(400).json({ error: "Invalid monitor ID" });
    }

    const periodIntervals: Record<string, string> = {
      "24h": "24 hours",
      "7d": "7 days",
      "30d": "30 days",
    };

    const interval = periodIntervals[period];

    if (!interval) {
      return res.status(400).json({
        error: "Invalid period. Use 24h, 7d, or 30d.",
      });
    }

    try {
      const result = await pool.query(
        `SELECT
           COUNT(cr.id)::int AS total_checks,
           COUNT(cr.id) FILTER (WHERE cr.success = true)::int
             AS successful_checks,
           COUNT(cr.id) FILTER (WHERE cr.success = false)::int
             AS failed_checks,
           ROUND(
             100.0 * COUNT(cr.id) FILTER (WHERE cr.success = true)
             / NULLIF(COUNT(cr.id), 0),
             2
           ) AS check_success_rate_percent,
           MIN(cr.checked_at) AS first_check_at,
           MAX(cr.checked_at) AS last_check_at
         FROM monitors m
         LEFT JOIN check_results cr
           ON cr.monitor_id = m.id
           AND cr.checked_at >= NOW() - $3::interval
         WHERE m.id = $1 AND m.user_id = $2
         GROUP BY m.id`,
        [monitorId, req.userId, interval]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Monitor not found" });
      }

      const row = result.rows[0];

      return res.json({
        monitor_id: monitorId,
        period,
        total_checks: row.total_checks,
        successful_checks: row.successful_checks,
        failed_checks: row.failed_checks,
        check_success_rate_percent:
          row.check_success_rate_percent === null
            ? null
            : Number(row.check_success_rate_percent),
        first_check_at: row.first_check_at,
        last_check_at: row.last_check_at,
        metric_type: "recorded_check_success_rate",
      });
    } catch (error) {
      console.error("Uptime query failed:", error);
      return res.status(500).json({
        error: "Unable to calculate monitor availability",
      });
    }
  }
);

// GET /api/analytics/:id/incidents
// Return the latest 100 incidents for a monitor owned by this user.
router.get(
  "/:id/incidents",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const monitorId = Number(req.params.id);

    if (!Number.isSafeInteger(monitorId) || monitorId <= 0) {
      return res.status(400).json({
        error: "Invalid monitor ID",
      });
    }

    try {
      const result = await pool.query(
        `SELECT
           i.id,
           i.monitor_id,
           m.name AS monitor_name,
           i.reason,
           i.started_at,
           i.resolved_at,
           CASE
             WHEN i.resolved_at IS NULL THEN 'ongoing'
             ELSE 'resolved'
           END AS status,
           ROUND(
             EXTRACT(
               EPOCH FROM (COALESCE(i.resolved_at, NOW()) - i.started_at)
             )::numeric,
             0
           )::bigint AS duration_seconds
         FROM incidents i
         JOIN monitors m ON m.id = i.monitor_id
         WHERE i.monitor_id = $1
           AND m.user_id = $2
         ORDER BY i.started_at DESC
         LIMIT 100`,
        [monitorId, req.userId]
      );

      return res.json({
        monitor_id: monitorId,
        incidents: result.rows,
      });
    } catch (error) {
      console.error("Incident history failed:", error);
      return res.status(500).json({
        error: "Unable to load incident history",
      });
    }
  }
);

export default router;
