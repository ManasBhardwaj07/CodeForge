"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { getToken } from "@/lib/auth-client";

const LANGUAGES = [
  { value: "JAVASCRIPT", label: "JavaScript", starter: '// Write your solution here\n\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\nrl.on("line", (line) => {\n  // process input\n  console.log(line);\n  rl.close();\n});\n' },
  { value: "CPP", label: "C++", starter: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    \n    return 0;\n}\n' },
  { value: "PYTHON", label: "Python", starter: '# Write your solution here\n\nimport sys\n\nfor line in sys.stdin:\n    line = line.strip()\n    if not line:\n        continue\n    print(line)\n' },
  { value: "JAVA", label: "Java", starter: 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n    String line;\n    while ((line = br.readLine()) != null) {\n      if (line.isEmpty()) continue;\n      System.out.println(line);\n    }\n  }\n}\n' },
  { value: "C", label: "C", starter: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    char buffer[1024];\n    while (fgets(buffer, sizeof(buffer), stdin)) {\n        fputs(buffer, stdout);\n    }\n    return 0;\n}\n' },
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

const VERDICT_HELP: Record<string, string> = {
  ACCEPTED: "All test cases passed. Great job!",
  WRONG_ANSWER: "Your output did not match the expected output for at least one test case.",
  TIMEOUT: "Your program exceeded the time limit. Optimize your solution or reduce complexity.",
  RUNTIME_ERROR: "Your program crashed during execution. Check for invalid memory access or exceptions.",
  COMPILE_ERROR: "Compilation failed. Fix syntax errors or missing declarations.",
};

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

        {/* Verdict + error info */}
        {(submission.verdict || submission.errorCode || submission.errorMessage) && (
          <div className="px-5 py-3 space-y-2" style={{ borderBottom: "1px solid #1e3058", background: "rgba(34,211,238,0.04)" }}>
            {submission.verdict && (
              <p className="text-xs" style={{ color: "#94a3b8" }}>
                {VERDICT_HELP[submission.verdict] ?? "See details below for more info."}
              </p>
            )}
            {(submission.errorCode || submission.errorMessage) && (
              <p className="text-xs font-mono" style={{ color: "#f43f5e" }}>
                {[submission.errorCode, submission.errorMessage].filter(Boolean).join(": ")}
              </p>
            )}
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
  
  // Tab state: 'editor' or 'custom-input'
  const [activeTab, setActiveTab] = useState<'editor' | 'custom-input'>('editor');
  
  // Run Code state (for quick run in editor tab)
  const [runJobId, setRunJobId] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runPolling, setRunPolling] = useState(false);
  const [runResult, setRunResult] = useState<{ status: string; stdout?: string; stderr?: string; executionTimeMs?: number; exitCode?: number } | null>(null);
  
  // Custom input state (for second tab)
  const [customInput, setCustomInput] = useState('');
  const [customRunJobId, setCustomRunJobId] = useState<string | null>(null);
  const [customRunLoading, setCustomRunLoading] = useState(false);
  const [customRunPolling, setCustomRunPolling] = useState(false);
  const [customRunResult, setCustomRunResult] = useState<{ status: string; stdout?: string; stderr?: string; executionTimeMs?: number; exitCode?: number } | null>(null);

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

  async function handleRun() {
    setRunLoading(true);
    setRunResult(null);
    setError(null);

    try {
      const token = getToken();
      if (!token) { setError("You must be logged in."); return; }

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ language, code, customInput: '' }),
      });
      const data = await res.json() as { jobId?: string; error?: string };
      if (res.status === 401 || res.status === 403) { window.location.href = "/login"; return; }
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      if (!data.jobId) throw new Error("Job ID missing");

      setRunJobId(data.jobId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Run failed");
      setRunLoading(false);
    }
  }

  async function handleCustomInputRun() {
    setCustomRunLoading(true);
    setCustomRunResult(null);
    setError(null);

    try {
      const token = getToken();
      if (!token) { setError("You must be logged in."); return; }

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ language, code, customInput }),
      });
      const data = await res.json() as { jobId?: string; error?: string };
      if (res.status === 401 || res.status === 403) { window.location.href = "/login"; return; }
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      if (!data.jobId) throw new Error("Job ID missing");

      setCustomRunJobId(data.jobId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Run failed");
      setCustomRunLoading(false);
    }
  }

  // Poll run result (quick run)
  useEffect(() => {
    if (!runJobId) return;
    setRunPolling(true);
    setRunLoading(false);
    const interval = setInterval(async () => {
      try {
        const token = getToken();
        const res = await fetch(`/api/run-status/${runJobId}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok) {
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            setRunResult(data);
            setRunPolling(false);
            clearInterval(interval);
          }
        }
      } catch {
        clearInterval(interval);
        setRunPolling(false);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [runJobId]);

  // Poll custom input run result
  useEffect(() => {
    if (!customRunJobId) return;
    setCustomRunPolling(true);
    setCustomRunLoading(false);
    const interval = setInterval(async () => {
      try {
        const token = getToken();
        const res = await fetch(`/api/run-status/${customRunJobId}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok) {
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            setCustomRunResult(data);
            setCustomRunPolling(false);
            clearInterval(interval);
          }
        }
      } catch {
        clearInterval(interval);
        setCustomRunPolling(false);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [customRunJobId]);

  const isBusy = loading || polling;

  return (
    <>
      {showModal && submission && (
        <ResultModal submission={submission} onClose={() => setShowModal(false)} />
      )}

      <div className="flex flex-col h-full">
        {/* Toolbar: Just Language Selector */}
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
          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => handleLangChange(e.target.value)}
            className="forge-select text-xs font-medium px-2.5 py-1 rounded-md border transition-colors"
            style={{
                background: "#0d1526",
                border: "1px solid #1e3058",
                color: "#e2e8f0",
                outline: "none",
              }}
              disabled={isBusy}
            >
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
        </div>

        {/* Tabs: Main Editor | Run with Custom Input */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid #1e3058", background: "rgba(0,0,0,0.2)" }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('editor');
              setRunJobId(null);
              setRunResult(null);
            }}
            className="px-4 py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === 'editor' ? '#22d3ee' : '#64748b',
              borderBottom: activeTab === 'editor' ? '2px solid #22d3ee' : 'none',
              background: activeTab === 'editor' ? 'rgba(34,211,238,0.05)' : 'transparent',
            }}
          >
            Code Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom-input')}
            className="px-4 py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === 'custom-input' ? '#22d3ee' : '#64748b',
              borderBottom: activeTab === 'custom-input' ? '2px solid #22d3ee' : 'none',
              background: activeTab === 'custom-input' ? 'rgba(34,211,238,0.05)' : 'transparent',
            }}
          >
            Run with Custom Input
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 flex">
          {activeTab === 'editor' ? (
            <>
              {/* Code Editor (left side, full or split) */}
              <div className={`flex flex-col ${runResult ? 'w-1/2' : 'w-full'}`} style={{ borderRight: runResult ? '1px solid #1e3058' : 'none' }}>
                <CodeEditor value={code} onChange={setCode} language={language} height="100%" />
              </div>

              {/* Run Output Panel (right side, when running) */}
              {runResult && (
                <div className="w-1/2 flex flex-col overflow-hidden" style={{ background: "#0f172a" }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: "#1e3058" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: "#cbd5e1" }}>Output</span>
                      <button
                        onClick={() => setRunResult(null)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: "#64748b", background: "rgba(100,116,139,0.1)" }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-xs font-semibold mb-2" style={{ color: "#94a3b8" }}>Stdout</div>
                        <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "#1e293b", color: "#cbd5e1", maxHeight: "150px" }}>
                          {runResult.stdout || "(empty)"}
                        </pre>
                      </div>
                      {runResult.stderr && (
                        <div>
                          <div className="text-xs font-semibold mb-2" style={{ color: "#f43f5e" }}>Stderr</div>
                          <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e", maxHeight: "150px" }}>
                            {runResult.stderr}
                          </pre>
                        </div>
                      )}
                      {runResult.executionTimeMs != null && (
                        <div className="text-xs" style={{ color: "#64748b" }}>
                          Execution Time: <span style={{ color: "#cbd5e1" }}>{runResult.executionTimeMs}ms</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Custom Input Tab */
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0f172a" }}>
              <div className="flex-1 flex flex-col p-4 space-y-3 overflow-auto">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#cbd5e1" }}>
                    Custom Input
                  </label>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter input for your code..."
                    className="w-full p-3 rounded-lg font-mono text-sm resize-none"
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#e2e8f0",
                      height: "200px",
                    }}
                  />
                </div>

                {customRunResult && (
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #334155", background: "#0f172a" }}>
                    <div className="px-3 py-2 font-mono text-xs font-semibold" style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                      Output
                    </div>
                    <pre className="p-3 overflow-auto text-xs" style={{ color: "#cbd5e1", maxHeight: "200px", fontFamily: "var(--font-mono)" }}>
                      {customRunResult.stdout || "(empty)"}
                    </pre>
                    {customRunResult.stderr && (
                      <div className="px-3 py-2 font-mono text-xs" style={{ color: "#f43f5e", borderTop: "1px solid #334155" }}>
                        <strong>Stderr:</strong> {customRunResult.stderr}
                      </div>
                    )}
                    {customRunResult.executionTimeMs != null && (
                      <div className="px-3 py-2 text-xs" style={{ color: "#64748b", borderTop: "1px solid #334155" }}>
                        Execution: {customRunResult.executionTimeMs}ms
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error Messages */}
        {error && (
          <div
            className="shrink-0 flex items-center gap-2 px-4 py-3 text-xs animate-shake"
            style={{ background: "rgba(244,63,94,0.1)", borderTop: "1px solid rgba(244,63,94,0.3)", color: "#f43f5e" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
            </svg>
            {error}
          </div>
        )}

        {/* Footer: Action Buttons */}
        <div
          className="shrink-0 px-4 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid #1e3058", background: "rgba(0,0,0,0.3)" }}
        >
          {/* Run Code Button */}
          <button
            onClick={activeTab === 'editor' ? handleRun : handleCustomInputRun}
            disabled={(activeTab === 'editor' ? runLoading || runPolling : customRunLoading || customRunPolling) || !code.trim()}
            className="forge-btn-primary flex items-center gap-2 text-sm"
            style={{ padding: "0.45rem 1.25rem" }}
          >
            {(activeTab === 'editor' ? runLoading || runPolling : customRunLoading || customRunPolling) ? (
              <>
                <svg className="animate-spin-forge" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Running…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run Code
              </>
            )}
          </button>

          {/* Submit Button (right) */}
          <form onSubmit={handleSubmit} style={{ display: "inline" }}>
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
    </>
  );
}
