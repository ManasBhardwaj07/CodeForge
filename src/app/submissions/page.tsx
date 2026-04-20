"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/auth-client";

type Submission = {
  id: string;
  verdict: string | null;
  createdAt: string;
  problem?: { title?: string };
};

function VerdictChip({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span style={{ color: "#64748b" }}>—</span>;
  const v = verdict.toUpperCase();
  const map: Record<string, { bg: string; color: string }> = {
    ACCEPTED:      { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
    WRONG_ANSWER:  { bg: "rgba(244,63,94,0.12)",  color: "#f43f5e" },
    TIMEOUT:       { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
    RUNTIME_ERROR: { bg: "rgba(251,146,60,0.12)", color: "#fb923c" },
    COMPILE_ERROR: { bg: "rgba(167,139,250,0.12)",color: "#a78bfa" },
  };
  const style = map[v] ?? { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
  const label = v.replace("_", " ");
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}
    >
      {label === "ACCEPTED" ? "✓ " : ""}{label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const token = getToken();
      if (!token) { window.location.href = "/login"; return; }
      try {
        const res = await fetch("/api/my-submissions", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) { window.location.href = "/login"; return; }
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json() as unknown;
        setItems(Array.isArray(data) ? (data as Submission[]) : []);
      } catch {
        setError("Could not load submissions.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const sorted = [...items].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return sortAsc ? ta - tb : tb - ta;
  });

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#e2e8f0" }}>
            My Submissions
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {items.length} submission{items.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link href="/problems" className="forge-btn-ghost text-sm" style={{ padding: "0.4rem 1rem" }}>
          ← Problems
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <svg className="animate-spin-forge" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span className="text-sm" style={{ color: "#64748b" }}>Loading submissions…</span>
        </div>
      ) : error ? (
        <div className="py-10 text-center" style={{ color: "#f43f5e" }}>{error}</div>
      ) : items.length === 0 ? (
        <div className="forge-card py-16 text-center">
          <p className="text-base font-semibold mb-2" style={{ color: "#e2e8f0" }}>No submissions yet</p>
          <p className="text-sm mb-5" style={{ color: "#64748b" }}>Pick a problem and submit your first solution!</p>
          <Link href="/problems" className="forge-btn-primary text-sm" style={{ padding: "0.5rem 1.25rem" }}>
            Browse Problems
          </Link>
        </div>
      ) : (
        <div className="forge-card overflow-hidden">
          {/* Table header */}
          <div
            className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3 text-xs font-bold uppercase tracking-wider"
            style={{ borderBottom: "1px solid #1e3058", color: "#64748b", background: "rgba(0,0,0,0.3)" }}
          >
            <span>#</span>
            <span>Problem</span>
            <span>Verdict</span>
            <button
              type="button"
              onClick={() => setSortAsc((v) => !v)}
              className="flex items-center gap-1 hover:opacity-80"
            >
              When
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {sortAsc
                  ? <polyline points="18 15 12 9 6 15"/>
                  : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            </button>
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: "#1e3058" }}>
            {sorted.map((s, i) => (
              <div
                key={s.id}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3.5 items-center text-sm transition-colors"
                style={{ color: "#e2e8f0" }}
              >
                <span className="font-mono text-xs" style={{ color: "#334155" }}>{i + 1}</span>
                <div>
                  <p className="font-medium">{s.problem?.title ?? "Unknown Problem"}</p>
                  <p className="text-xs mt-0.5 font-mono" style={{ color: "#334155" }}>
                    {s.id.slice(0, 12)}…
                  </p>
                </div>
                <VerdictChip verdict={s.verdict} />
                <div className="text-right text-xs" style={{ color: "#64748b" }}>
                  <p>{timeAgo(s.createdAt)}</p>
                  <p className="mt-0.5">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
