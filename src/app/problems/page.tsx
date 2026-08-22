"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";

type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
};

const DIFF_ORDER: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

function DiffBadge({ difficulty }: { difficulty: string }) {
  const d = difficulty.toUpperCase();
  const cls =
    d === "EASY" ? "forge-badge-easy" :
    d === "MEDIUM" ? "forge-badge-medium" :
    "forge-badge-hard";
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${cls}`}>
      {d === "EASY" ? "Easy" : d === "MEDIUM" ? "Medium" : "Hard"}
    </span>
  );
}

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "EASY" | "MEDIUM" | "HARD">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/problems", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch problems");
        const data = await res.json() as { problems?: Problem[] } | Problem[];
        const list: Problem[] = Array.isArray(data)
          ? data
          : (data as { problems?: Problem[] }).problems ?? [];
        setProblems(list.sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 9) - (DIFF_ORDER[b.difficulty] ?? 9)));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      const matchDiff = filter === "ALL" || p.difficulty.toUpperCase() === filter;
      const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
      return matchDiff && matchSearch;
    });
  }, [problems, filter, search]);

  const counts = useMemo(() => ({
    ALL: problems.length,
    EASY: problems.filter((p) => p.difficulty.toUpperCase() === "EASY").length,
    MEDIUM: problems.filter((p) => p.difficulty.toUpperCase() === "MEDIUM").length,
    HARD: problems.filter((p) => p.difficulty.toUpperCase() === "HARD").length,
  }), [problems]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ color: "var(--color-forge-text)" }}>
          Problems
        </h1>
        <p className="text-sm" style={{ color: "var(--color-forge-muted)" }}>
          Pick a problem, write a solution, submit your code.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 mb-6 items-center">
        {/* Search */}
        <div className="min-w-0">
          <input
            type="text"
            className="forge-input w-full"
            placeholder="Search problems…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Difficulty pills */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg flex-wrap justify-start"
          style={{ background: "var(--color-forge-surface)", border: "1px solid var(--color-forge-border)" }}
        >
          {(["ALL", "EASY", "MEDIUM", "HARD"] as const).map((d) => {
            const active = filter === d;
            const color = d === "EASY" ? "#10b981" : d === "MEDIUM" ? "#f59e0b" : d === "HARD" ? "#f43f5e" : "var(--color-forge-cyan)";
            return (
              <button
                key={d}
                onClick={() => setFilter(d)}
                className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all duration-150 hover:bg-white/5"
                style={{
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "var(--color-forge-muted)",
                  border: active ? `1px solid ${color}40` : "1px solid transparent",
                  cursor: "pointer"
                }}
              >
                {d} {d !== "ALL" && <span className="ml-0.5 opacity-70">({counts[d]})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <svg className="animate-spin-forge" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span className="text-sm" style={{ color: "#64748b" }}>Loading problems…</span>
        </div>
      ) : error ? (
        <div className="py-10 text-center" style={{ color: "#f43f5e" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="forge-card py-24 px-6 text-center flex flex-col items-center justify-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: "#e2e8f0" }}>No problems found</p>
          <p className="text-sm max-w-sm" style={{ color: "#64748b" }}>
            We couldn&apos;t find any problems matching your current filters. Try adjusting your search criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {filtered.map((problem, i) => (
            <Link
              key={problem.id}
              href={`/problems/${problem.id}`}
              className="forge-card-hover flex items-center justify-between px-5 py-4 cursor-pointer block"
            >
              <div className="flex items-center gap-4">
                <span
                  className="text-sm font-mono w-7 text-right shrink-0"
                  style={{ color: "var(--color-forge-muted)" }}
                >
                  {i + 1}.
                </span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--color-forge-text)" }}>{problem.title}</p>
                  <p
                    className="text-xs mt-0.5 line-clamp-1"
                    style={{ color: "var(--color-forge-muted)", maxWidth: "42ch" }}
                  >
                    {problem.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <DiffBadge difficulty={problem.difficulty} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-forge-muted)" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
