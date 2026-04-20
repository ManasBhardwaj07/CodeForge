import React from "react";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
};

export function ProblemList({ problems, onSelect }: {
  problems: Problem[];
  onSelect?: (problem: Problem) => void;
}) {
  const safeProblems = Array.isArray(problems) ? problems : [];
  if (safeProblems.length === 0) {
    return <div style={{ color: "#64748b" }}>No problems found.</div>;
  }
  return (
    <div className="space-y-2">
      {safeProblems.map((problem) => (
        <div
          key={problem.id}
          className="forge-card-hover px-5 py-4 cursor-pointer"
          onClick={() => onSelect?.(problem)}
          tabIndex={0}
          role="button"
          aria-label={`Select problem ${problem.title}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect?.(problem);
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: "#e2e8f0" }}>{problem.title}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#1e3058", color: "#94a3b8" }}>
              {problem.difficulty}
            </span>
          </div>
          <p className="text-sm mt-1 line-clamp-2" style={{ color: "#64748b" }}>{problem.description}</p>
        </div>
      ))}
    </div>
  );
}
