"use client";

import React, { useEffect, useState } from "react";

type Worker = {
  workerId: string;
  lastHeartbeat: string;
  activeJobs: number;
  status: string;
  ttlSeconds: number;
};

type HealthResponse = {
  status: string;
  workers: { total: number; online: number; workers: Worker[] };
  queues: Record<string, Record<string, number>>;
};

export default function AdminQueuesPage() {
  const [token, setToken] = useState<string>("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchHealth() {
    if (!token) {
      setError("Please provide a Bearer token to query protected endpoints.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/queue/health", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const json = (await res.json()) as HealthResponse;
      setHealth(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    let poll: number | undefined;

    if (token) {
      void fetchHealth();
      poll = window.setInterval(() => {
        if (mounted) void fetchHealth();
      }, 5000);
    }

    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
    };
    // intentionally only depend on token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>Admin — Queues</h1>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>Paste Bearer token</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJ..."
          style={{ width: "60%", padding: 8, fontSize: 14 }}
        />
        <button onClick={fetchHealth} style={{ marginLeft: 8, padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>Error: {error}</div>
      )}

      {loading && <div>Loading...</div>}

      {health && (
        <div>
          <section style={{ marginBottom: 18 }}>
            <h2>Workers — {health.workers.online}/{health.workers.total} online</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Last heartbeat</th>
                  <th>Active jobs</th>
                  <th>Status</th>
                  <th>TTL (s)</th>
                </tr>
              </thead>
              <tbody>
                {health.workers.workers.map((w) => (
                  <tr key={w.workerId}>
                    <td style={{ padding: 6 }}>{w.workerId}</td>
                    <td style={{ padding: 6 }}>{new Date(w.lastHeartbeat).toLocaleString()}</td>
                    <td style={{ padding: 6 }}>{w.activeJobs}</td>
                    <td style={{ padding: 6 }}>{w.status}</td>
                    <td style={{ padding: 6 }}>{w.ttlSeconds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: 18 }}>
            <h2>Queues</h2>
            <div style={{ display: "flex", gap: 24 }}>
              {Object.entries(health.queues).map(([qname, counts]) => (
                <div key={qname} style={{ minWidth: 220 }}>
                  <h3>{qname}</h3>
                  <table>
                    <tbody>
                      {Object.entries(counts).map(([key, val]) => (
                        <tr key={key}>
                          <td style={{ paddingRight: 8 }}>{key}</td>
                          <td style={{ fontWeight: 600 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
