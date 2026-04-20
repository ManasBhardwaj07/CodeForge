import React from "react";

const VERDICTS: Record<string, { bg: string; color: string; label: string }> = {
  ACCEPTED:      { bg: "rgba(16,185,129,0.12)", color: "#10b981", label: "✓ Accepted" },
  WRONG_ANSWER:  { bg: "rgba(244,63,94,0.12)",  color: "#f43f5e", label: "✗ Wrong Answer" },
  TIMEOUT:       { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "⏱ Time Limit Exceeded" },
  RUNTIME_ERROR: { bg: "rgba(251,146,60,0.12)", color: "#fb923c", label: "⚠ Runtime Error" },
  COMPILE_ERROR: { bg: "rgba(167,139,250,0.12)",color: "#a78bfa", label: "⚙ Compile Error" },
};

export function SubmissionStatus({ status, verdict }: {
  status: string;
  verdict?: string | null;
}) {
  const v = verdict?.toUpperCase() ?? null;
  const style = v ? (VERDICTS[v] ?? null) : null;

  return (
    <div className="flex items-center gap-3 my-2">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748b" }}>
        Status:
      </span>
      <span className="text-xs font-bold" style={{ color: "#94a3b8" }}>{status}</span>
      {style && (
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-bold"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}40` }}
        >
          {style.label}
        </span>
      )}
    </div>
  );
}
