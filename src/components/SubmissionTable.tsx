import React from "react";

export type Submission = {
  id: string;
  problem: { title: string };
  verdict: string | null;
  createdAt: string;
};

const VERDICT_STYLE: Record<string, { bg: string; color: string }> = {
  ACCEPTED:      { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  WRONG_ANSWER:  { bg: "rgba(244,63,94,0.12)",  color: "#f43f5e" },
  TIMEOUT:       { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  RUNTIME_ERROR: { bg: "rgba(251,146,60,0.12)", color: "#fb923c" },
  COMPILE_ERROR: { bg: "rgba(167,139,250,0.12)",color: "#a78bfa" },
};

function VerdictChip({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span style={{ color: "#64748b" }}>Pending</span>;
  const v = verdict.toUpperCase();
  const style = VERDICT_STYLE[v] ?? { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" };
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}
    >
      {v.replace("_", " ")}
    </span>
  );
}

export function SubmissionTable({ submissions }: { submissions: Submission[] }) {
  const safe = Array.isArray(submissions) ? submissions : [];
  if (safe.length === 0) {
    return <p className="text-sm" style={{ color: "#64748b" }}>No submissions found.</p>;
  }
  return (
    <div className="forge-card overflow-hidden">
      <div
        className="grid grid-cols-3 gap-4 px-5 py-3 text-xs font-bold uppercase tracking-wider"
        style={{ borderBottom: "1px solid #1e3058", color: "#64748b", background: "rgba(0,0,0,0.3)" }}
      >
        <span>Problem</span>
        <span>Verdict</span>
        <span>Submitted</span>
      </div>
      <div className="divide-y" style={{ borderColor: "#1e3058" }}>
        {safe.map((sub) => (
          <div key={sub.id} className="grid grid-cols-3 gap-4 px-5 py-3.5 items-center text-sm">
            <span style={{ color: "#e2e8f0" }}>{sub.problem.title}</span>
            <VerdictChip verdict={sub.verdict} />
            <span className="text-xs" style={{ color: "#64748b" }}>
              {new Date(sub.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
