"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { getToken } from "@/lib/auth-client";

const LANGUAGES = [
  { value: "JAVASCRIPT", label: "JavaScript", starter: '// Write your solution here\n\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\nrl.on("line", (line) => {\n  // process input\n  console.log(line);\n  rl.close();\n});\n' },
  { value: "CPP", label: "C++", starter: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    \n    return 0;\n}\n' },
];

const TERMINAL = new Set(["COMPLETED", "FAILED"]);
const POLL_MS = 2000;

type ExecResult = {
  id?: string;
  testCaseId?: string;
  inputSnapshot?: string;
  expectedOutputSnapshot?: string;
  actualOutput?: string;
  stderr?: string;
  passed?: boolean;
  executionTimeMs?: number | null;
};

type Submission = {
  id: string;
  status: string;
  verdict?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  executionResults?: ExecResult[];
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const upper = verdict.toUpperCase();
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ACCEPTED:      { bg: "rgba(16,185,129,0.12)", color: "#10b981", label: "✓ Accepted" },
    WRONG_ANSWER:  { bg: "rgba(244,63,94,0.12)",  color: "#f43f5e", label: "✗ Wrong Answer" },
    TIMEOUT:       { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "⏱ Time Limit Exceeded" },
    RUNTIME_ERROR: { bg: "rgba(251,146,60,0.12)", color: "#fb923c", label: "⚠ Runtime Error" },
    COMPILE_ERROR: { bg: "rgba(167,139,250,0.12)",color: "#a78bfa", label: "⚙ Compile Error" },
  };
  const style = map[upper] ?? { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: verdict };
  return (
    <span
      className="px-3 py-1 rounded-full text-sm font-bold"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}40` }}
    >
      {style.label}
    </span>
  );
}

function TestCaseRow({ result, index }: { result: ExecResult; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${result.passed ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
        background: result.passed ? "rgba(16,185,129,0.04)" : "rgba(244,63,94,0.04)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium"
        style={{ color: "#e2e8f0" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: result.passed ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)",
              color: result.passed ? "#10b981" : "#f43f5e",
            }}
          >
            {result.passed ? "✓" : "✗"}
          </span>
          Test Case {index + 1}
          {result.executionTimeMs != null && (
            <span className="text-xs" style={{ color: "#64748b" }}>{result.executionTimeMs}ms</span>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#64748b" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 text-xs" style={{ borderTop: "1px solid #1e3058" }}>
          {[
            { label: "Input", value: result.inputSnapshot },
            { label: "Expected", value: result.expectedOutputSnapshot },
            { label: "Actual", value: result.actualOutput },
            ...(result.stderr ? [{ label: "Error", value: result.stderr }] : []),
          ].map(({ label, value }) => value != null && (
            <div key={label}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: "#64748b" }}>{label}</div>
              <pre
                className="rounded p-2 text-xs leading-relaxed overflow-x-auto"
                style={{ background: "#0a0f1e", color: "#e2e8f0", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}
              >
                {value || "—"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultModal({
  submission,
  onClose,
}: {
  submission: Submission;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const results = submission.executionResults ?? [];
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="forge-card w-full max-w-2xl max-h-[80vh] flex flex-col animate-pop"
        style={{ boxShadow: "0 0 80px rgba(0,0,0,0.6)" }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #1e3058" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" style={{ color: "#e2e8f0" }}>Submission Result</span>
            {submission.verdict && <VerdictBadge verdict={submission.verdict} />}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "#64748b", background: "transparent" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid #1e3058" }}>
            <div className="flex justify-between text-xs mb-2" style={{ color: "#64748b" }}>
              <span>Test Cases</span>
              <span style={{ color: passed === total ? "#10b981" : "#f43f5e" }}>
                {passed}/{total} passed
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1e3058" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(passed / total) * 100}%`,
                  background: passed === total ? "#10b981" : "#f43f5e",
                }}
              />
            </div>
          </div>
        )}

        {/* Error info */}
        {(submission.errorCode || submission.errorMessage) && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid #1e3058", background: "rgba(244,63,94,0.05)" }}>
            <p className="text-xs font-mono" style={{ color: "#f43f5e" }}>
              {[submission.errorCode, submission.errorMessage].filter(Boolean).join(": ")}
            </p>
          </div>
        )}

        {/* Test cases */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#64748b" }}>No test case results.</p>
          ) : (
            results.map((r, i) => <TestCaseRow key={r.testCaseId ?? i} result={r} index={i} />)
          )}
        </div>
      </div>
    </div>
  );
}

export function ProblemSolver({ problemId }: { problemId: string }) {
  const defaultLang = LANGUAGES[0]!;
  const [language, setLanguage] = useState(defaultLang.value);
  const [code, setCode] = useState(defaultLang.starter);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Update starter code when language changes
  const handleLangChange = (lang: string) => {
    setLanguage(lang);
    const entry = LANGUAGES.find((l) => l.value === lang);
    if (entry) setCode(entry.starter);
  };

  useEffect(() => {
    if (!submissionId) return;
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const token = getToken();
        const res = await fetch(`/api/submissions/${submissionId}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) return;
        const data = await res.json() as { submission?: Submission } | Submission;
        const sub: Submission = (data as { submission?: Submission }).submission ?? (data as Submission);
        setSubmission(sub);
        if (TERMINAL.has(sub.status)) {
          clearInterval(interval);
          setPolling(false);
          setShowModal(true);
        }
      } catch {
        // ignore poll errors
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [submissionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSubmission(null);
    setSubmissionId(null);

    try {
      const token = getToken();
      if (!token) { setError("You must be logged in."); return; }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ problemId, code, language }),
      });
      const data = await res.json() as {
        submissionId?: string;
        submission?: { id: string };
        error?: string;
      };
      if (res.status === 401 || res.status === 403) { window.location.href = "/login"; return; }
      if (!res.ok) throw new Error(data.error ?? "Submission failed");

      const sid = data.submissionId ?? data.submission?.id;
      if (!sid) throw new Error("Submission ID missing from response");
      setSubmissionId(sid);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  const isBusy = loading || polling;

  return (
    <>
      {showModal && submission && (
        <ResultModal submission={submission} onClose={() => setShowModal(false)} />
      )}

      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid #1e3058", background: "rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94a3b8" }}>Editor</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Language selector */}
            <select
              value={language}
              onChange={(e) => handleLangChange(e.target.value)}
              className="text-xs font-medium px-2.5 py-1 rounded-md border transition-colors"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid #1e3058",
                color: "#94a3b8",
                outline: "none",
              }}
              disabled={isBusy}
            >
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0">
          <CodeEditor value={code} onChange={setCode} language={language} height="100%" />
        </div>

        {/* Footer / Submit bar */}
        <div
          className="shrink-0 px-4 py-3 flex flex-col gap-2"
          style={{ borderTop: "1px solid #1e3058", background: "rgba(0,0,0,0.3)" }}
        >
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs animate-shake"
              style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", color: "#f43f5e" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
              </svg>
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* Result peek (not modal) */}
            {submission && !showModal && !polling && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 text-xs font-medium"
                style={{ color: "#22d3ee" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                View last result
              </button>
            )}
            {polling && (
              <span className="flex items-center gap-2 text-xs" style={{ color: "#22d3ee" }}>
                <svg className="animate-spin-forge" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Evaluating…
              </span>
            )}
            {!submission && !polling && <span />}

            <form onSubmit={handleSubmit}>
              <button
                type="submit"
                disabled={isBusy || !code.trim()}
                className="forge-btn-primary flex items-center gap-2 text-sm"
                style={{ padding: "0.45rem 1.25rem" }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin-forge" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Submitting
                  </>
                ) : polling ? (
                  "Running…"
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Submit
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
