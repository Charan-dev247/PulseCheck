
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../services/api";

type Monitor = {
  id: number;
  name: string;
  url: string;
  status: "up" | "down" | "unknown";
  is_active: boolean;
};

type CheckResult = {
  id: number;
  success: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  checked_at: string;
};

type UptimeStats = {
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  check_success_rate_percent: number | null;
  metric_type: string;
};

type Incident = {
  id: number;
  reason: string;
  started_at: string;
  resolved_at: string | null;
  status: "ongoing" | "resolved";
  duration_seconds: number;
};

type Period = "24h" | "7d" | "30d";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

export default function MonitorDetails() {
  const { id } = useParams<{ id: string }>();

  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [history, setHistory] = useState<CheckResult[]>([]);
  const [uptime, setUptime] = useState<UptimeStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [period, setPeriod] = useState<Period>("24h");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refreshData(isInitialLoad = false) {
    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
      setError("Invalid monitor ID.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const [monitorResponse, historyResponse, incidentsResponse, uptimeResponse] =
        await Promise.all([
          api.get(`/monitors/${id}`),
          api.get(`/analytics/${id}/history`),
          api.get(`/analytics/${id}/incidents`),
          api.get(`/analytics/${id}/uptime`, { params: { period } }),
        ]);

      setMonitor(monitorResponse.data.monitor ?? monitorResponse.data);
      setHistory(historyResponse.data.history ?? []);
      setIncidents(incidentsResponse.data.incidents ?? []);
      setUptime(uptimeResponse.data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(
        err.response?.status === 404
          ? "Monitor not found."
          : err.response?.data?.error ??
              "Unable to refresh monitor details. Your last loaded data is preserved."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
        setError("Invalid monitor ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [monitorResponse, historyResponse, incidentsResponse, uptimeResponse] =
          await Promise.all([
            api.get(`/monitors/${id}`),
            api.get(`/analytics/${id}/history`),
            api.get(`/analytics/${id}/incidents`),
            api.get(`/analytics/${id}/uptime`, { params: { period } }),
          ]);

        if (cancelled) return;
        setMonitor(monitorResponse.data.monitor ?? monitorResponse.data);
        setHistory(historyResponse.data.history ?? []);
        setIncidents(incidentsResponse.data.incidents ?? []);
        setUptime(uptimeResponse.data);
        setLastUpdated(new Date());
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err.response?.status === 404
            ? "Monitor not found."
            : err.response?.data?.error ??
                "Unable to load monitor details. Please try again."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [id, period]);

  useEffect(() => {
    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) return;

    const intervalId = window.setInterval(() => {
      void refreshData(false);
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [id, period]);

  const chartData = useMemo(
    () =>
      [...history]
        .filter(
          (item) => item.success && item.response_ms !== null
        )
        .reverse()
        .map((item) => ({
          time: new Date(item.checked_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          responseMs: item.response_ms as number,
        })),
    [history]
  );

  if (loading) {
    return (
      <main className="monitor-details-page">
        <p>Loading monitor details...</p>
      </main>
    );
  }

  if (error || !monitor) {
    return (
      <main className="monitor-details-page">
        <Link to="/dashboard">← Back to dashboard</Link>
        <p className="monitor-details-error">
          {error || "Monitor not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="monitor-details-page">
      <header className="monitor-details-header">
        <div>
          <Link to="/dashboard" className="monitor-back-link">
            ← Dashboard
          </Link>

          <h1>{monitor.name}</h1>
          <a href={monitor.url} target="_blank" rel="noreferrer">
            {monitor.url}
          </a>
        </div>

        <div className="monitor-details-header-actions">
          <div className="monitor-details-badges">
            <span className={`monitor-status-badge status-${monitor.status}`}>
              {monitor.status.toUpperCase()}
            </span>
            <span className="monitor-active-badge">
              {monitor.is_active ? "Monitoring active" : "Monitoring paused"}
            </span>
          </div>
          <button
            type="button"
            className="monitor-refresh-button"
            onClick={() => void refreshData(false)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
          <p className="monitor-last-updated">
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
              : "Not updated yet"}
            {" · Auto-refresh every 30 seconds"}
          </p>
        </div>
      </header>

      {error && (
        <p className="monitor-details-error" role="alert">
          {error}
        </p>
      )}

      <section className="monitor-details-section">
        <div className="monitor-section-heading">
          <div>
            <h2>Availability</h2>
            <p>Success rate of recorded checks, not elapsed-time uptime.</p>
          </div>

          <div className="monitor-period-controls">
            {(["24h", "7d", "30d"] as Period[]).map((value) => (
              <button
                key={value}
                type="button"
                className={period === value ? "selected" : ""}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="monitor-stats-grid">
          <article className="monitor-stat-card">
            <span>Check success rate</span>
            <strong>
              {uptime?.check_success_rate_percent == null
                ? "—"
                : `${uptime.check_success_rate_percent}%`}
            </strong>
          </article>

          <article className="monitor-stat-card">
            <span>Total checks</span>
            <strong>{uptime?.total_checks ?? "—"}</strong>
          </article>

          <article className="monitor-stat-card">
            <span>Successful checks</span>
            <strong>{uptime?.successful_checks ?? "—"}</strong>
          </article>

          <article className="monitor-stat-card">
            <span>Failed checks</span>
            <strong>{uptime?.failed_checks ?? "—"}</strong>
          </article>
        </div>
      </section>

      <section className="monitor-details-section">
        <div className="monitor-section-heading">
          <div>
            <h2>Response time</h2>
            <p>Successful checks from the latest 100 recorded results.</p>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="monitor-empty-state">
            No successful response-time data is available yet.
          </p>
        ) : (
          <div className="monitor-chart">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={30} />
                <YAxis
                  width={65}
                  label={{
                    value: "Milliseconds",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip
                  formatter={(value) => [`${value} ms`, "Response time"]}
                />
                <Line
                  type="monotone"
                  dataKey="responseMs"
                  name="Response time"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="monitor-details-section">
        <div className="monitor-section-heading">
          <div>
            <h2>Recent check history</h2>
            <p>Latest recorded checks, including failures and their error details.</p>
          </div>
          <span>{Math.min(history.length, 100)} checks</span>
        </div>

        {history.length === 0 ? (
          <p className="monitor-empty-state">
            No check history is available yet.
          </p>
        ) : (
          <div className="monitor-table-wrapper">
            <table className="monitor-incidents-table">
              <thead>
                <tr>
                  <th>Checked at</th>
                  <th>Result</th>
                  <th>HTTP status</th>
                  <th>Response time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 100).map((check) => (
                  <tr key={check.id}>
                    <td>{formatDate(check.checked_at)}</td>
                    <td>
                      <span
                        className={
                          check.success
                            ? "incident-status-resolved"
                            : "incident-status-ongoing"
                        }
                      >
                        {check.success ? "Success" : "Failed"}
                      </span>
                    </td>
                    <td>{check.status_code ?? "—"}</td>
                    <td>
                      {check.response_ms == null
                        ? "—"
                        : `${check.response_ms} ms`}
                    </td>
                    <td>{check.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="monitor-details-section">
        <div className="monitor-section-heading">
          <div>
            <h2>Incident history</h2>
            <p>Outages recorded for this monitor.</p>
          </div>
          <span>{incidents.length} incidents</span>
        </div>

        {incidents.length === 0 ? (
          <p className="monitor-empty-state">
            No incidents recorded for this monitor.
          </p>
        ) : (
          <div className="monitor-table-wrapper">
            <table className="monitor-incidents-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>{formatDate(incident.started_at)}</td>
                    <td>{formatDuration(Number(incident.duration_seconds))}</td>
                    <td>{incident.reason || "Unknown error"}</td>
                    <td>
                      <span
                        className={
                          incident.status === "ongoing"
                            ? "incident-status-ongoing"
                            : "incident-status-resolved"
                        }
                      >
                        {incident.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
