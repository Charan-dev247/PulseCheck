
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
import app from "../app";

describe("Monitor API validation", () => {
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
});
