
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../db/pool", () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("../queue", () => ({
  checkQueue: {},
  scheduleMonitor: vi.fn(),
  unscheduleMonitor: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authenticateToken: (
    req: any,
    res: any,
    next: any
  ) => {
    if (req.headers.authorization !== "Bearer test-token") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.userId = 1;
    next();
  },
}));

import { pool } from "../db/pool";
import { scheduleMonitor } from "../queue";
import app from "../app";

describe("Monitor API validation and creation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without authentication", async () => {
    const response = await request(app).get("/api/monitors");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects monitor creation when name and URL are missing", async () => {
    const response = await request(app)
      .post("/api/monitors")
      .set("Authorization", "Bearer test-token")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Name and URL are required",
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects unsupported URL protocols", async () => {
    const response = await request(app)
      .post("/api/monitors")
      .set("Authorization", "Bearer test-token")
      .send({
        name: "Example",
        url: "ftp://example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Only HTTP and HTTPS URLs are supported",
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid monitor ID", async () => {
    const response = await request(app)
      .get("/api/monitors/abc")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Invalid monitor ID",
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns 404 when the monitor does not exist", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [],
    } as any);

    const response = await request(app)
      .get("/api/monitors/123")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Monitor not found",
    });
    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND user_id = $2"),
      [123, 1]
    );
  });

  it("returns 500 when fetching monitors fails", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    const response = await request(app)
      .get("/api/monitors")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Unable to fetch monitors",
    });
  });

  it("creates a monitor successfully", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          name: "Example",
          url: "https://example.com/",
          interval_seconds: 300,
        },
      ],
    } as any);

    const response = await request(app)
      .post("/api/monitors")
      .set("Authorization", "Bearer test-token")
      .send({
        name: " Example ",
        url: "https://example.com",
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Monitor created successfully");
    expect(response.body.monitor.id).toBe(10);
    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO monitors"),
      [1, "Example", "https://example.com/"]
    );
    expect(scheduleMonitor).toHaveBeenCalledWith(10, 300);
  });

  it("returns 500 when database insertion fails", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    const response = await request(app)
      .post("/api/monitors")
      .set("Authorization", "Bearer test-token")
      .send({
        name: "Example",
        url: "https://example.com",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Unable to create monitor",
    });
  });

  it("rolls back monitor creation when scheduling fails", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            name: "Example",
            url: "https://example.com/",
            interval_seconds: 300,
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    vi.mocked(scheduleMonitor).mockRejectedValueOnce(
      new Error("Redis unavailable")
    );

    const response = await request(app)
      .post("/api/monitors")
      .set("Authorization", "Bearer test-token")
      .send({
        name: "Example",
        url: "https://example.com",
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Unable to schedule monitor. Please try again.",
    });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenLastCalledWith(
      "DELETE FROM monitors WHERE id = $1 AND user_id = $2",
      [10, 1]
    );
  });
});
