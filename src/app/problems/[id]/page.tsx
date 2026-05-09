import React from "react";
import Link from "next/link";
import { ProblemSolver } from "@/components/ProblemSolver";

type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  testCases?: {
    id: string;
    input: string;
    expectedOutput: string;
    isSample: boolean;
    orderIndex: number;
  }[];
};

async function getProblem(id: string): Promise<Problem | null> {
  try {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    const res = await fetch(`${base}/api/problems/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Problem;
  } catch {
    return null;
  }
}

function DiffBadge({ difficulty }: { difficulty: string }) {
  const d = difficulty.toUpperCase();
  const style =
    d === "EASY"   ? { bg: "rgba(16,185,129,0.15)",  color: "#10b981", border: "rgba(16,185,129,0.35)" } :
    d === "MEDIUM" ? { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b", border: "rgba(245,158,11,0.35)" } :
                    { bg: "rgba(244,63,94,0.15)",   color: "#f43f5e", border: "rgba(244,63,94,0.35)" };
  return (
    <span
      className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
    >
      {d === "EASY" ? "Easy" : d === "MEDIUM" ? "Medium" : "Hard"}
    </span>
  );
}

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problem = await getProblem(id);

  if (!problem) {
    return (
      <main className="max-w-2xl mx-auto py-16 px-6 text-center">
        <div
          className="forge-card inline-flex flex-col items-center gap-3 px-10 py-8"
          style={{ color: "#f43f5e" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="font-semibold">Problem not found.</p>
          <Link href="/problems" className="text-sm" style={{ color: "#22d3ee" }}>← Back to problems</Link>
        </div>
      </main>
    );
  }

  return (
    <div
      className="flex animate-fade-in"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* ── LEFT PANE: Problem description ── */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: "50%",
          borderRight: "1px solid #1e3058",
          background: "#0d1526",
        }}
      >
        {/* Problem header */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid #1e3058", background: "rgba(0,0,0,0.3)" }}
        >
          <Link
            href="/problems"
            className="inline-flex items-center gap-1.5 text-xs mb-3 hover:opacity-80 transition-opacity"
            style={{ color: "#64748b" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Problems
          </Link>
          <h1 className="text-xl font-extrabold mb-2 leading-tight" style={{ color: "#e2e8f0" }}>
            {problem.title}
          </h1>
          <DiffBadge difficulty={problem.difficulty} />
        </div>

        {/* Description */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div
            className="text-sm leading-relaxed whitespace-pre-line"
            style={{ color: "#94a3b8" }}
          >
            {problem.description}
          </div>

          {/* Examples */}
          {problem.testCases?.some((t) => t.isSample) && (
            <div className="mt-8 space-y-3">
              <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Examples</p>
              {problem.testCases
                ?.filter((t) => t.isSample)
                .map((sample, idx) => (
                  <div key={sample.id} className="forge-card p-4">
                    <div className="text-xs font-semibold mb-2" style={{ color: "#94a3b8" }}>
                      Example {idx + 1}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold mb-1" style={{ color: "#64748b" }}>Input</div>
                        <pre
                          className="rounded p-2 text-xs leading-relaxed overflow-x-auto"
                          style={{ background: "#0a0f1e", color: "#e2e8f0", fontFamily: "var(--font-mono)" }}
                        >
                          {sample.input || "—"}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1" style={{ color: "#64748b" }}>Output</div>
                        <pre
                          className="rounded p-2 text-xs leading-relaxed overflow-x-auto"
                          style={{ background: "#0a0f1e", color: "#e2e8f0", fontFamily: "var(--font-mono)" }}
                        >
                          {sample.expectedOutput || "—"}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Tip box */}
          <div
            className="mt-8 rounded-xl p-4 text-xs"
            style={{
              background: "rgba(34,211,238,0.05)",
              border: "1px solid rgba(34,211,238,0.15)",
              color: "#64748b",
            }}
          >
            <p className="font-semibold mb-1" style={{ color: "#22d3ee" }}>💡 Tip</p>
            <p>Read the input from <strong style={{ color: "#94a3b8" }}>stdin</strong> and print your answer to <strong style={{ color: "#94a3b8" }}>stdout</strong>. Make sure your output exactly matches the expected format.</p>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANE: Code Editor ── */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: "50%", background: "#080d1a" }}
      >
        <ProblemSolver problemId={problem.id} />
      </div>
    </div>
  );
}
