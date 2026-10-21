
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Globe,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock3,
  LogOut,
  Gauge,
  TrendingUp,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

type AnalyticsSummary = {
  total_monitors: number;
  up_monitors: number;
  down_monitors: number;
  unknown_monitors: number;
  paused_monitors: number;
  avg_response_ms: string | number | null;
  total_checks: number;
  successful_checks: number;
  success_rate_percent: string | number | null;
};

type CheckHistory = {
  id: number;
  success: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  checked_at: string;
};

type UptimeStats = {
  monitor_id: number;
  period: "24h" | "7d" | "30d";
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  check_success_rate_percent: number | null;
  first_check_at: string | null;
  last_check_at: string | null;
  metric_type: "recorded_check_success_rate";
};

type Incident = {
  id: number;
  monitor_id: number;
  monitor_name: string;
  reason: string;
  started_at: string;
  resolved_at: string | null;
  status: "ongoing" | "resolved";
  duration_seconds: number | string;
};

type Monitor = {
  id: number;
  name: string;
  url: string;
  method?: string;
  interval_seconds: number;
  timeout_ms?: number;
  status: "up" | "down" | "unknown";
  is_active: boolean;
  created_at?: string;
};

export default function Dashboard() {
  const navigate = useNavigate();

  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [history, setHistory] = useState<CheckHistory[]>([]);
  const [latestResponseTimes, setLatestResponseTimes] = useState<
    Record<number, number | null>
  >({});
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(
    null,
  );
  const [uptimePeriod, setUptimePeriod] = useState<"24h" | "7d" | "30d">(
    "24h",
  );
  const [uptimeStats, setUptimeStats] = useState<UptimeStats | null>(null);
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingMonitorId, setTogglingMonitorId] = useState<number | null>(
    null,
  );

  const loadMonitors = useCallback(async () => {
    setError("");
    setRefreshing(true);

    try {
      const [monitorResponse, analyticsResponse] = await Promise.all([
        api.get("/monitors"),
        api.get("/analytics/summary"),
      ]);

      const monitorData = monitorResponse.data;
      const monitorList: Monitor[] = Array.isArray(monitorData)
        ? monitorData
        : monitorData.monitors ?? [];

      setMonitors(monitorList);
      setAnalytics(analyticsResponse.data);
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "response" in err) {
        const apiError = err as {
          response?: {
            status?: number;
            data?: { message?: string; error?: string };
          };
        };

        if (apiError.response?.status === 401) {
          localStorage.removeItem("pulsecheck_token");
          navigate("/login", { replace: true });
          return;
        }

        setError(
          apiError.response?.data?.message ??
            apiError.response?.data?.error ??
            "Unable to load dashboard data.",
        );
      } else {
        setError(
          "Unable to connect to the API. Check that the backend is running.",
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadMonitors();
  }, [loadMonitors]);

  // Load the latest recorded response time for each monitor card.
  useEffect(() => {
    let cancelled = false;

    async function fetchLatestResponseTimes() {
      if (monitors.length === 0) {
        setLatestResponseTimes({});
        return;
      }

      const entries = await Promise.all(
        monitors.map(async (monitor) => {
          try {
            const response = await api.get(
              `/analytics/${monitor.id}/history`,
            );
            const rows: CheckHistory[] = response.data.history ?? [];
            const latestWithResponse = rows.find(
              (item) => item.response_ms !== null,
            );
            return [
              monitor.id,
              latestWithResponse?.response_ms ?? null,
            ] as const;
          } catch {
            return [monitor.id, null] as const;
          }
        }),
      );

      if (!cancelled) {
        setLatestResponseTimes(Object.fromEntries(entries));
      }
    }

    void fetchLatestResponseTimes();

    return () => {
      cancelled = true;
    };
  }, [monitors]);

  // Keep the selected monitor valid when monitors are added or deleted.
  useEffect(() => {
    setSelectedMonitorId((currentId) => {
      if (
        currentId !== null &&
        monitors.some((monitor) => monitor.id === currentId)
      ) {
        return currentId;
      }

      return monitors[0]?.id ?? null;
    });
  }, [monitors]);

  // Fetch history whenever the selected monitor changes.
  useEffect(() => {
    if (selectedMonitorId === null) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchHistory() {
      setHistoryLoading(true);

      try {
        const response = await api.get(
          `/analytics/${selectedMonitorId}/history`,
        );

        if (cancelled) return;

        const rows: CheckHistory[] = response.data.history ?? [];

        // The API returns newest first; the chart reads oldest first.
        setHistory(rows.slice().reverse());
      } catch {
        if (!cancelled) {
          setHistory([]);
          setError("Unable to load response-time history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [selectedMonitorId]);

  // Load recorded-check availability for the selected monitor and time period.
  useEffect(() => {
    if (selectedMonitorId === null) {
      setUptimeStats(null);
      setUptimeLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchUptime() {
      setUptimeLoading(true);

      try {
        const response = await api.get(
          `/analytics/${selectedMonitorId}/uptime`,
          { params: { period: uptimePeriod } },
        );

        if (!cancelled) {
          setUptimeStats(response.data as UptimeStats);
        }
      } catch {
        if (!cancelled) {
          setUptimeStats(null);
          setError("Unable to load availability statistics.");
        }
      } finally {
        if (!cancelled) {
          setUptimeLoading(false);
        }
      }
    }

    void fetchUptime();

    return () => {
      cancelled = true;
    };
  }, [selectedMonitorId, uptimePeriod]);

  // Load incident history for the selected monitor.
  useEffect(() => {
    if (selectedMonitorId === null) {
      setIncidents([]);
      setIncidentsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchIncidents() {
      setIncidentsLoading(true);

      try {
        const response = await api.get(
          `/analytics/${selectedMonitorId}/incidents`,
        );

        if (!cancelled) {
          setIncidents(response.data.incidents ?? []);
        }
      } catch {
        if (!cancelled) {
          setIncidents([]);
          setError("Unable to load incident history.");
        }
      } finally {
        if (!cancelled) {
          setIncidentsLoading(false);
        }
      }
    }

    void fetchIncidents();

    return () => {
      cancelled = true;
    };
  }, [selectedMonitorId]);

  async function addMonitor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.post("/monitors", { name, url });
      setName("");
      setUrl("");
      setShowForm(false);
      await loadMonitors();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "response" in err) {
        const apiError = err as {
          response?: { data?: { message?: string; error?: string } };
        };

        setError(
          apiError.response?.data?.message ??
            apiError.response?.data?.error ??
            "Unable to add monitor.",
        );
      } else {
        setError("Unable to connect to the API.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleMonitor(monitor: Monitor) {
    if (togglingMonitorId !== null) return;

    const nextActiveState = !monitor.is_active;

    setTogglingMonitorId(monitor.id);
    setError("");

    try {
      await api.patch(`/monitors/${monitor.id}`, {
        is_active: nextActiveState,
      });

      await loadMonitors();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "response" in err) {
        const apiError = err as {
          response?: {
            status?: number;
            data?: { message?: string; error?: string };
          };
        };

        if (apiError.response?.status === 401) {
          localStorage.removeItem("pulsecheck_token");
          navigate("/login", { replace: true });
          return;
        }

        setError(
          apiError.response?.data?.message ??
            apiError.response?.data?.error ??
            `Unable to ${nextActiveState ? "resume" : "pause"} monitor. Please try again.`,
        );
      } else {
        setError(
          `Unable to ${nextActiveState ? "resume" : "pause"} monitor. Please check your API connection.`,
        );
      }
    } finally {
      setTogglingMonitorId(null);
    }
  }

  async function deleteMonitor(id: number) {
    if (
      !window.confirm(
        "Delete this monitor? Its monitoring schedule will be removed.",
      )
    ) {
      return;
    }

    setError("");

    try {
      await api.delete(`/monitors/${id}`);
      await loadMonitors();
    } catch {
      setError("Unable to delete monitor. Please try again.");
    }
  }

  function logout() {
    localStorage.removeItem("pulsecheck_token");
    navigate("/login", { replace: true });
  }

  const totalMonitors = analytics?.total_monitors ?? monitors.length;

  const upCount =
    analytics?.up_monitors ??
    monitors.filter(
      (monitor) => monitor.is_active && monitor.status === "up",
    ).length;

  const downCount =
    analytics?.down_monitors ??
    monitors.filter(
      (monitor) => monitor.is_active && monitor.status === "down",
    ).length;

  const unknownCount =
    analytics?.unknown_monitors ??
    monitors.filter(
      (monitor) => monitor.is_active && monitor.status === "unknown",
    ).length;

  const pausedCount =
    analytics?.paused_monitors ??
    monitors.filter((monitor) => !monitor.is_active).length;

  const averageResponse = analytics?.avg_response_ms;
  const successRate = analytics?.success_rate_percent;

  const formatMetric = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return "—";

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "—";
  };

  const formatDuration = (seconds: number | string) => {
    const totalSeconds = Math.max(0, Number(seconds) || 0);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = Math.floor(totalSeconds % 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${remainingSeconds}s`;
  };

  const selectedMonitor = monitors.find(
    (monitor) => monitor.id === selectedMonitorId,
  );

  const chartData = history
  .filter((item) => item.success && item.response_ms !== null)
  .map((item) => ({
    time: new Date(item.checked_at).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    responseMs: item.response_ms as number,
    success: item.success,
    statusCode: item.status_code,
  }));

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-icon">
            <Activity size={22} />
          </span>
          <span>PulseCheck</span>
        </div>

        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => void loadMonitors()}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "refresh-spinning" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button className="secondary-button" onClick={logout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">MONITORING OVERVIEW</p>
            <h1>Your websites</h1>
            <p className="muted">
              Monitor availability and manage your endpoints.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => setShowForm((current) => !current)}
          >
            <Plus size={18} />
            Add monitor
          </button>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {showForm && (
          <form className="monitor-form" onSubmit={addMonitor}>
            <h2>Add a website</h2>

            <label htmlFor="monitor-name">Monitor name</label>
            <input
              id="monitor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production website"
              maxLength={100}
              required
            />

            <label htmlFor="monitor-url">Website URL</label>
            <input
              id="monitor-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />

            <p className="muted form-hint">
              New monitors use the backend&apos;s default check interval and
              timeout.
            </p>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Adding..." : "Create monitor"}
              </button>
            </div>
          </form>
        )}

        <div className="stats-grid">
          <Stat
            title="Total monitors"
            value={loading ? "…" : totalMonitors}
            icon={<Globe />}
          />
          <Stat
            title="Operational"
            value={loading ? "…" : upCount}
            icon={<CheckCircle2 />}
            tone="green"
          />
          <Stat
            title="Down"
            value={loading ? "…" : downCount}
            icon={<XCircle />}
            tone="red"
          />
          <Stat
            title="Unknown"
            value={loading ? "…" : unknownCount}
            icon={<Clock3 />}
          />
          <Stat
            title="Paused"
            value={loading ? "…" : pausedCount}
            icon={<PauseCircle />}
          />
        </div>

        <div className="stats-grid analytics-grid">
          <Stat
            title="Avg. response time (24h)"
            value={
              loading
                ? "…"
                : averageResponse == null
                  ? "—"
                  : `${formatMetric(averageResponse)} ms`
            }
            icon={<Gauge />}
          />
          <Stat
            title="Check success rate (24h)"
            value={
              loading
                ? "…"
                : successRate == null
                  ? "—"
                  : `${formatMetric(successRate)}%`
            }
            icon={<TrendingUp />}
            tone="green"
          />
          <Stat
            title="Recorded checks (24h)"
            value={loading ? "…" : (analytics?.total_checks ?? 0)}
            icon={<Activity />}
          />
          <Stat
            title="Successful checks (24h)"
            value={loading ? "…" : (analytics?.successful_checks ?? 0)}
            icon={<CheckCircle2 />}
            tone="green"
          />
        </div>

        <section className="monitor-section uptime-section">
          <div className="section-heading">
            <div>
              <h2>Availability overview</h2>
              <p className="muted">
                Success rate based on recorded checks, not elapsed-time uptime
              </p>
            </div>

            <select
              className="monitor-select"
              aria-label="Select availability period"
              value={uptimePeriod}
              onChange={(e) =>
                setUptimePeriod(e.target.value as "24h" | "7d" | "30d")
              }
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          {uptimeLoading ? (
            <div className="empty-state">
              Loading availability statistics...
            </div>
          ) : selectedMonitorId === null ? (
            <div className="empty-state">
              Add a monitor to view availability.
            </div>
          ) : uptimeStats ? (
            <>
              <div className="stats-grid uptime-stats-grid">
                <Stat
                  title="Check success rate"
                  value={
                    uptimeStats.check_success_rate_percent == null
                      ? "—"
                      : `${uptimeStats.check_success_rate_percent.toFixed(2)}%`
                  }
                  icon={<TrendingUp />}
                  tone="green"
                />
                <Stat
                  title="Recorded checks"
                  value={uptimeStats.total_checks}
                  icon={<Activity />}
                />
                <Stat
                  title="Successful checks"
                  value={uptimeStats.successful_checks}
                  icon={<CheckCircle2 />}
                  tone="green"
                />
                <Stat
                  title="Failed checks"
                  value={uptimeStats.failed_checks}
                  icon={<XCircle />}
                  tone="red"
                />
              </div>
              {uptimeStats.total_checks === 0 && (
                <p className="muted uptime-note">
                  No checks were recorded during this period.
                </p>
              )}
            </>
          ) : (
            <div className="empty-state">
              Availability statistics are currently unavailable.
            </div>
          )}
        </section>

        <section className="monitor-section chart-section">
          <div className="section-heading">
            <div>
              <h2>Response-time history</h2>
              <p className="muted">
                Recorded response times for a selected website
              </p>
            </div>

            <select
              className="monitor-select"
              aria-label="Select monitor for response-time chart"
              value={selectedMonitorId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedMonitorId(id > 0 ? id : null);
              }}
              disabled={monitors.length === 0}
            >
              {monitors.length === 0 ? (
                <option value="">No monitors available</option>
              ) : (
                monitors.map((monitor) => (
                  <option key={monitor.id} value={monitor.id}>
                    {monitor.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedMonitor && (
            <p className="muted chart-subtitle">
              {selectedMonitor.url} · Showing up to 100 recent checks
            </p>
          )}

          <div className="chart-container">
            {historyLoading ? (
              <div className="empty-state">
                Loading response-time history...
              </div>
            ) : monitors.length === 0 ? (
              <div className="empty-state">
                Add a monitor to view its response-time history.
              </div>
            ) : chartData.length === 0 ? (
              <div className="empty-state">
                <Activity size={30} />
                <h3>No response-time history yet</h3>
                <p>
                  The chart will appear after your monitor records checks with
                  response-time measurements.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                >
                  <CartesianGrid
                    stroke="#292e3b"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#9299aa"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="#9299aa"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={55}
                    label={{
                      value: "ms",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9299aa",
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141720",
                      border: "1px solid #343a49",
                      borderRadius: 8,
                      color: "#e5e7eb",
                    }}
                    formatter={(value) => [
                      `${value} ms`,
                      "Successful response time",
                    ]}
                    labelStyle={{ color: "#aeb6ca" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="responseMs"
                    name="Response time"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="monitor-section incident-section">
          <div className="section-heading">
            <div>
              <h2>Incident history</h2>
              <p className="muted">
                Outages and recoveries for the selected website
              </p>
            </div>
            <span className="monitor-count">
              {incidents.length} incidents
            </span>
          </div>

          {selectedMonitorId === null ? (
            <div className="empty-state">
              Add a monitor to view its incident history.
            </div>
          ) : incidentsLoading ? (
            <div className="empty-state">Loading incident history...</div>
          ) : incidents.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={30} />
              <h3>No incidents recorded</h3>
              <p>
                No outages have been recorded for this website. If a monitor
                goes down and reaches its failure threshold, the incident will
                appear here.
              </p>
            </div>
          ) : (
            <div className="incident-list">
              {incidents.map((incident) => (
                <article className="incident-row" key={incident.id}>
                  <div
                    className={`incident-symbol ${
                      incident.status === "ongoing"
                        ? "incident-symbol-down"
                        : "incident-symbol-resolved"
                    }`}
                  >
                    {incident.status === "ongoing" ? (
                      <XCircle size={20} />
                    ) : (
                      <CheckCircle2 size={20} />
                    )}
                  </div>

                  <div className="incident-details">
                    <div className="incident-title-row">
                      <h3>{incident.monitor_name}</h3>
                      <span
                        className={`status-badge ${
                          incident.status === "ongoing"
                            ? "status-down"
                            : "status-up"
                        }`}
                      >
                        <span className="status-dot" />
                        {incident.status === "ongoing"
                          ? "Ongoing"
                          : "Resolved"}
                      </span>
                    </div>
                    <p className="incident-reason">
                      {incident.reason || "Monitor failed its health checks"}
                    </p>
                    <p className="muted incident-meta">
                      Started: {new Date(incident.started_at).toLocaleString()}
                    </p>
                    <p className="muted incident-meta">
                      {incident.resolved_at
                        ? `Recovered: ${new Date(incident.resolved_at).toLocaleString()}`
                        : "Not yet recovered"}
                      {" · Duration: "}
                      {formatDuration(incident.duration_seconds)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="monitor-section">
          <div className="section-heading">
            <div>
              <h2>All monitors</h2>
              <p className="muted">
                Live status from your monitoring service
              </p>
            </div>
            <span className="monitor-count">{monitors.length} total</span>
          </div>

          {loading ? (
            <div className="empty-state">Loading monitors...</div>
          ) : monitors.length === 0 ? (
            <div className="empty-state">
              <Globe size={32} />
              <h3>No monitors yet</h3>
              <p>
                Add your first website to start monitoring its availability.
              </p>
              <button
                className="primary-button"
                onClick={() => setShowForm(true)}
              >
                <Plus size={18} />
                Add your first monitor
              </button>
            </div>
          ) : (
            <div className="monitor-list">
              {monitors.map((monitor) => {
                const isToggling = togglingMonitorId === monitor.id;

                return (
                  <article className="monitor-row" key={monitor.id}>
                    <div className="monitor-symbol">
                      <Globe size={20} />
                    </div>

                    <div className="monitor-details">
                      <h3>{monitor.name}</h3>
                      <a
                        href={monitor.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {monitor.url}
                      </a>
                      <p className="muted">
                        Every {monitor.interval_seconds}s
                        {monitor.timeout_ms != null
                          ? ` · Timeout ${monitor.timeout_ms}ms`
                          : ""}
                      </p>
                      <p className="muted monitor-latest-response">
                        Latest response:{" "}
                        {latestResponseTimes[monitor.id] == null
                          ? "—"
                          : `${latestResponseTimes[monitor.id]} ms`}
                      </p>
                      <Link
                        to={`/monitors/${monitor.id}`}
                        className="monitor-view-details"
                      >
                        View Details →
                      </Link>
                    </div>

                    {monitor.is_active ? (
                      <span
                        className={`status-badge status-${monitor.status}`}
                      >
                        <span className="status-dot" />
                        {monitor.status}
                      </span>
                    ) : (
                      <span className="status-badge status-unknown">
                        <span className="status-dot" />
                        Paused
                      </span>
                    )}

                    <button
                      className="secondary-button"
                      title={
                        monitor.is_active
                          ? `Pause ${monitor.name}`
                          : `Resume ${monitor.name}`
                      }
                      aria-label={
                        monitor.is_active
                          ? `Pause ${monitor.name}`
                          : `Resume ${monitor.name}`
                      }
                      disabled={togglingMonitorId !== null}
                      onClick={() => void toggleMonitor(monitor)}
                    >
                      {monitor.is_active ? (
                        <PauseCircle size={16} />
                      ) : (
                        <PlayCircle size={16} />
                      )}
                      {isToggling
                        ? "Updating..."
                        : monitor.is_active
                          ? "Pause"
                          : "Resume"}
                    </button>

                    <button
                      className="icon-button danger-button"
                      title={`Delete ${monitor.name}`}
                      aria-label={`Delete ${monitor.name}`}
                      onClick={() => void deleteMonitor(monitor.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="muted analytics-note">
          Availability percentages reflect recorded-check success rate. They do
          not estimate the exact duration a website was available between checks.
        </p>
      </section>
    </main>
  );
}

function Stat({
  title,
  value,
  icon,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "default" | "green" | "red";
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-${tone}`}>{icon}</div>
      <p>{title}</p>
      <strong>{value}</strong>
    </article>
  );
}
