
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

vi.mock("./db/pool", () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("./queue", () => ({
  checkQueue: {},
  scheduleMonitor: vi.fn(),
  unscheduleMonitor: vi.fn(),
}));

import { pool } from "./db/pool";
import app from "./app";

describe("GET /health", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when the database is connected", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: "PulseCheck API",
      database: "connected",
    });
  });

  it("returns 503 when the database query fails", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      service: "PulseCheck API",
      database: "disconnected",
    });
  });
});
