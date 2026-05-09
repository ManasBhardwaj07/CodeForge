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
    <main className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ color: "#e2e8f0" }}>
          Problems
        </h1>
        <p className="text-sm" style={{ color: "#64748b" }}>
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
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid #1e3058" }}
        >
          {(["ALL", "EASY", "MEDIUM", "HARD"] as const).map((d) => {
            const active = filter === d;
            const color = d === "EASY" ? "#10b981" : d === "MEDIUM" ? "#f59e0b" : d === "HARD" ? "#f43f5e" : "#22d3ee";
            return (
              <button
                key={d}
                onClick={() => setFilter(d)}
                className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all duration-150"
                style={{
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "#64748b",
                  border: active ? `1px solid ${color}40` : "1px solid transparent",
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
        <div className="py-16 text-center" style={{ color: "#64748b" }}>
          No problems match your filters.
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
                  style={{ color: "#334155" }}
                >
                  {i + 1}.
                </span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#e2e8f0" }}>{problem.title}</p>
                  <p
                    className="text-xs mt-0.5 line-clamp-1"
                    style={{ color: "#64748b", maxWidth: "42ch" }}
                  >
                    {problem.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <DiffBadge difficulty={problem.difficulty} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
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
