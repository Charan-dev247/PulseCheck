
import { Router } from "express";
import { pool } from "../db/pool";
import { scheduleMonitor, unscheduleMonitor } from "../queue";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth";

const router = Router();

// Create a monitor
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
  const { name, url } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof url !== "string" ||
    !url.trim()
  ) {
    return res.status(400).json({
      error: "Name and URL are required",
    });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: "Only HTTP and HTTPS URLs are supported",
      });
    }
  } catch {
    return res.status(400).json({
      error: "Please provide a valid URL",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO monitors (user_id, name, url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.userId, name.trim(), parsedUrl.toString()]
    );

    const monitor = result.rows[0];

    try {
      await scheduleMonitor(monitor.id, monitor.interval_seconds);
    } catch (error) {
      console.error("Monitor scheduling failed:", error);

      try {
        await pool.query(
          "DELETE FROM monitors WHERE id = $1 AND user_id = $2",
          [monitor.id, req.userId]
        );
      } catch (rollbackError) {
        console.error(
          "Failed to remove unscheduled monitor:",
          rollbackError
        );
      }

      return res.status(503).json({
        error: "Unable to schedule monitor. Please try again.",
      });
    }

    return res.status(201).json({
      message: "Monitor created successfully",
      monitor,
    });
  } catch (error) {
    console.error("Monitor creation failed:", error);

    return res.status(500).json({
      error: "Unable to create monitor",
    });
  }
});

// List monitors belonging to the authenticated user
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, url, status, is_active, interval_seconds,
              consecutive_failures, created_at
       FROM monitors
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );

    return res.json({ monitors: result.rows });
  } catch (error) {
    console.error("Fetching monitors failed:", error);

    return res.status(500).json({
      error: "Unable to fetch monitors",
    });
  }
});

// Get one monitor belonging to the authenticated user
router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid monitor ID" });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, url, method, interval_seconds, timeout_ms,
              expected_status, failure_threshold, is_active, status,
              consecutive_failures, created_at
       FROM monitors
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    return res.json({ monitor: result.rows[0] });
  } catch (error) {
    console.error("Fetching monitor failed:", error);

    return res.status(500).json({
      error: "Unable to fetch monitor",
    });
  }
});

// Update a monitor, including pausing and resuming.
// If scheduler changes fail, attempt to restore the previous settings.
router.patch("/:id", authenticateToken, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { name, url, interval_seconds, timeout_ms, is_active } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid monitor ID" });
  }

  if (
    (name !== undefined &&
      (typeof name !== "string" || !name.trim())) ||
    (url !== undefined && typeof url !== "string") ||
    (interval_seconds !== undefined &&
      (!Number.isInteger(interval_seconds) ||
        interval_seconds < 30 ||
        interval_seconds > 86400)) ||
    (timeout_ms !== undefined &&
      (!Number.isInteger(timeout_ms) ||
        timeout_ms < 1000 ||
        timeout_ms > 30000)) ||
    (is_active !== undefined && typeof is_active !== "boolean")
  ) {
    return res.status(400).json({
      error: "Invalid monitor settings",
    });
  }

  if (
    name === undefined &&
    url === undefined &&
    interval_seconds === undefined &&
    timeout_ms === undefined &&
    is_active === undefined
  ) {
    return res.status(400).json({
      error: "No settings provided",
    });
  }

  let normalizedUrl: string | null = null;

  if (url !== undefined) {
    try {
      const parsedUrl = new URL(url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({
          error: "Only HTTP and HTTPS URLs are supported",
        });
      }

      normalizedUrl = parsedUrl.toString();
    } catch {
      return res.status(400).json({
        error: "Please provide a valid URL",
      });
    }
  }

  try {
    const currentResult = await pool.query(
      `SELECT id, name, url, interval_seconds, timeout_ms, is_active
       FROM monitors
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    const current = currentResult.rows[0];

    const result = await pool.query(
      `UPDATE monitors
       SET name = COALESCE($1, name),
           url = COALESCE($2, url),
           interval_seconds = COALESCE($3, interval_seconds),
           timeout_ms = COALESCE($4, timeout_ms),
           is_active = COALESCE($5, is_active)
       WHERE id = $6 AND user_id = $7
       RETURNING id, name, url, interval_seconds, timeout_ms,
                 is_active, status`,
      [
        name === undefined ? null : name.trim(),
        normalizedUrl,
        interval_seconds ?? null,
        timeout_ms ?? null,
        is_active ?? null,
        id,
        req.userId,
      ]
    );

    const updated = result.rows[0];

    const activeStateChanged =
      is_active !== undefined && is_active !== current.is_active;

    const intervalChanged =
      interval_seconds !== undefined &&
      interval_seconds !== current.interval_seconds;

    const schedulerNeedsUpdate =
      activeStateChanged || (current.is_active && intervalChanged);

    if (schedulerNeedsUpdate) {
      try {
        if (updated.is_active) {
          await scheduleMonitor(id, updated.interval_seconds);
        } else {
          await unscheduleMonitor(id);
        }
      } catch (schedulerError) {
        console.error(
          "Monitor scheduling update failed:",
          schedulerError
        );

        // Attempt to restore the previous database settings.
        try {
          await pool.query(
            `UPDATE monitors
             SET name = $1,
                 url = $2,
                 interval_seconds = $3,
                 timeout_ms = $4,
                 is_active = $5
             WHERE id = $6 AND user_id = $7`,
            [
              current.name,
              current.url,
              current.interval_seconds,
              current.timeout_ms,
              current.is_active,
              id,
              req.userId,
            ]
          );
        } catch (rollbackError) {
          console.error(
            "Monitor settings rollback failed:",
            rollbackError
          );
        }

        // Attempt to restore the previous scheduler state.
        try {
          if (current.is_active) {
            await scheduleMonitor(id, current.interval_seconds);
          } else {
            await unscheduleMonitor(id);
          }
        } catch (schedulerRollbackError) {
          console.error(
            "Monitor scheduler rollback failed:",
            schedulerRollbackError
          );
        }

        return res.status(503).json({
          error:
            "Unable to update monitor scheduling. Previous settings were restored where possible; please verify the monitor state and retry.",
        });
      }
    }

    return res.json({ monitor: updated });
  } catch (error) {
    console.error("Updating monitor failed:", error);

    return res.status(500).json({
      error: "Unable to update monitor",
    });
  }
});

// Delete a monitor and remove its recurring scheduler
router.delete("/:id", authenticateToken, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid monitor ID" });
  }

  try {
    const existing = await pool.query(
      `SELECT id
       FROM monitors
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    await unscheduleMonitor(id);

    const result = await pool.query(
      `DELETE FROM monitors
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    return res.json({
      message: "Monitor deleted successfully",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Deleting monitor failed:", error);

    return res.status(500).json({
      error: "Unable to delete monitor",
    });
  }
});

export default router;
