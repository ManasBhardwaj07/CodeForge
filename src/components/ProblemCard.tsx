import React from "react";
import { Problem } from "./ProblemList";

const DIFF_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  EASY:   { bg: "rgba(16,185,129,0.15)",  color: "#10b981", border: "rgba(16,185,129,0.35)" },
  MEDIUM: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b", border: "rgba(245,158,11,0.35)" },
  HARD:   { bg: "rgba(244,63,94,0.15)",   color: "#f43f5e", border: "rgba(244,63,94,0.35)" },
};

export function ProblemCard({ problem }: { problem: Problem }) {
  const d = problem.difficulty.toUpperCase();
  const style = DIFF_STYLE[d] ?? { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "rgba(100,116,139,0.35)" };
  return (
    <div className="forge-card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-base leading-tight" style={{ color: "#e2e8f0" }}>
          {problem.title}
        </h2>
        <span
          className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
        >
          {d === "EASY" ? "Easy" : d === "MEDIUM" ? "Medium" : "Hard"}
        </span>
      </div>
      <p className="text-sm mt-2 line-clamp-2 leading-relaxed" style={{ color: "#64748b" }}>
        {problem.description}
      </p>
    </div>
  );
}
