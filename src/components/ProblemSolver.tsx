"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CodeEditor } from "@/components/CodeEditor";
import { Group, Panel, Separator, GroupImperativeHandle, Layout } from "react-resizable-panels";

const LANGUAGES = [
  { value: "C", label: "C", starter: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    char buffer[1024];\n    while (fgets(buffer, sizeof(buffer), stdin)) {\n        fputs(buffer, stdout);\n    }\n    return 0;\n}\n' },
  { value: "CPP", label: "C++", starter: '#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    \n    return 0;\n}\n' },
  { value: "JAVA", label: "Java", starter: 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n    String line;\n    while ((line = br.readLine()) != null) {\n      if (line.isEmpty()) continue;\n      System.out.println(line);\n    }\n  }\n}\n' },
  { value: "JAVASCRIPT", label: "JavaScript", starter: '// Write your solution here\n\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\nrl.on("line", (line) => {\n  // process input\n  console.log(line);\n  rl.close();\n});\n' },
  { value: "PYTHON", label: "Python", starter: '# Write your solution here\n\nimport sys\n\nfor line in sys.stdin:\n    line = line.strip()\n    if not line:\n        continue\n    print(line)\n' },
];

const TERMINAL = new Set(["COMPLETED", "FAILED"]);
const POLL_MS = 2000;
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  QUEUED: { bg: "rgba(59,130,246,0.12)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  RUNNING: { bg: "rgba(245,158,11,0.12)", text: "#f59e0b", border: "rgba(245,158,11,0.35)" },
  COMPLETED: { bg: "rgba(16,185,129,0.12)", text: "#10b981", border: "rgba(16,185,129,0.35)" },
  FAILED: { bg: "rgba(244,63,94,0.12)", text: "#f43f5e", border: "rgba(244,63,94,0.35)" },
};

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

type RunResult = {
  status: string;
  stdout?: string;
  stderr?: string;
  executionTimeMs?: number;
  exitCode?: number;
  outputTruncated?: boolean;
  error?: string;
  errorType?: "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT" | "INFRA_ERROR" | "NONE" | null;
};

type Submission = {
  id: string;
  status: string;
  verdict?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  executionResults?: ExecResult[];
};

function StatusPill({ label, status }: { label: string; status: string }) {
  const style = STATUS_COLORS[status] ?? { bg: "rgba(100,116,139,0.12)", text: "var(--color-forge-muted)", border: "rgba(100,116,139,0.35)" };
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
    >
      {label}: {status}
    </span>
  );
}



function VerdictBadge({ verdict }: { verdict: string }) {
  const upper = verdict.toUpperCase();
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ACCEPTED:      { bg: "rgba(16,185,129,0.12)", color: "#10b981", label: "✓ Accepted" },
    WRONG_ANSWER:  { bg: "rgba(244,63,94,0.12)",  color: "#f43f5e", label: "✗ Wrong Answer" },
    TIMEOUT:       { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "⏱ Time Limit Exceeded" },
    RUNTIME_ERROR: { bg: "rgba(251,146,60,0.12)", color: "#fb923c", label: "⚠ Runtime Error" },
    COMPILE_ERROR: { bg: "rgba(167,139,250,0.12)",color: "#a78bfa", label: "⚙ Compile Error" },
  };
  const style = map[upper] ?? { bg: "rgba(100,116,139,0.12)", color: "var(--color-forge-muted)", label: verdict };
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
        style={{ color: "var(--color-forge-text)" }}
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
            <span className="text-xs" style={{ color: "var(--color-forge-muted)" }}>{result.executionTimeMs}ms</span>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-forge-muted)" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 text-xs" style={{ borderTop: "1px solid var(--color-forge-border)" }}>
          {[
            { label: "Input", value: result.inputSnapshot },
            { label: "Expected", value: result.expectedOutputSnapshot },
            { label: "Actual", value: result.actualOutput },
            ...(result.stderr ? [{ label: "Error", value: result.stderr }] : []),
          ].map(({ label, value }) => value != null && (
            <div key={label}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: "var(--color-forge-muted)" }}>{label}</div>
              <pre
                className="rounded p-2 text-xs leading-relaxed overflow-x-auto"
                style={{ background: "var(--color-forge-bg)", color: "var(--color-forge-text)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}
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
  nextProblemId,
}: {
  submission: Submission;
  onClose: () => void;
  nextProblemId?: string | null;
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
          style={{ borderBottom: "1px solid var(--color-forge-border)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" style={{ color: "var(--color-forge-text)" }}>Submission Result</span>
            {submission.verdict && <VerdictBadge verdict={submission.verdict} />}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--color-forge-muted)", background: "transparent" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--color-forge-border)" }}>
            <div className="flex justify-between text-xs mb-2" style={{ color: "var(--color-forge-muted)" }}>
              <span>Test Cases</span>
              <span style={{ color: passed === total ? "#10b981" : "#f43f5e" }}>
                {passed}/{total} passed
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-forge-border)" }}>
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
          <div className="px-5 py-3 space-y-2" style={{ borderBottom: "1px solid var(--color-forge-border)", background: "rgba(34,211,238,0.04)" }}>
            {submission.verdict && (
              <p className="text-xs" style={{ color: "var(--color-forge-muted)" }}>
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
            <p className="text-sm text-center py-8" style={{ color: "var(--color-forge-muted)" }}>No test case results.</p>
          ) : (
            results.map((r, i) => <TestCaseRow key={r.testCaseId ?? i} result={r} index={i} />)
          )}
        </div>

        {/* Footer Navigation */}
        <div className="shrink-0 px-5 py-4 flex items-center justify-end gap-3" style={{ borderTop: "1px solid var(--color-forge-border)", background: "rgba(0,0,0,0.2)" }}>
          <Link href="/submissions" className="text-sm font-semibold transition-colors hover:text-[#22d3ee]" style={{ color: "var(--color-forge-muted)" }}>
            View Submissions
          </Link>
          {nextProblemId && (
            <Link href={`/problems/${nextProblemId}`} className="forge-btn-primary flex items-center gap-2 text-sm" style={{ padding: "0.5rem 1.25rem" }}>
              Next Problem
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProblemSolver({
  problemId,
  language: initialLanguage = "JAVASCRIPT",
  sampleInput = "",
  nextProblemId = null,
}: {
  problemId: string;
  language?: string;
  sampleInput?: string;
  nextProblemId?: string | null;
}) {
  const defaultLang = LANGUAGES[0]!;
  const executionVersion = useRef(0);
  const submissionLock = useRef(false);
  const runLock = useRef(false);

  // ── Auth state machine ─────────────────────────────────────────────────────
  // UNKNOWN → GUEST | AUTHENTICATED
  // All localStorage draft access is blocked until this resolves.
  type AuthState = 'UNKNOWN' | 'GUEST' | 'AUTHENTICATED';
  const [authState, setAuthState] = useState<AuthState>('UNKNOWN');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json() as { authenticated?: boolean; user?: { id: string } };
            if (data.authenticated && data.user) {
              setUserId(data.user.id);
              setAuthState('AUTHENTICATED');
              return;
            }
          }
          setAuthState('GUEST');
        }
      } catch {
        if (!cancelled) setAuthState('GUEST');
      }
    }
    checkAuth();
    return () => { cancelled = true; };
  }, []);

  const initLang = LANGUAGES.find((l) => l.value === initialLanguage) ?? defaultLang;
  const [language, setLanguage] = useState(initLang.value);
  const [code, setCode] = useState(initLang.starter);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Terminal tab state: 'testcases' shows stdin input, 'output' shows run result
  const [terminalTab, setTerminalTab] = useState<'testcases' | 'output'>('testcases');
  const panelGroupRef = useRef<GroupImperativeHandle>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const handleChange = () => setIsMobile(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Persistence: Restore layout from localStorage imperatively on mount
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem("workspace-layout");
      if (savedLayout) {
        panelGroupRef.current?.setLayout(JSON.parse(savedLayout));
      }
    } catch (e) {
      console.error("Failed to restore layout", e);
    }
  }, []);

  const handleLayoutChange = (layout: Layout) => {
    localStorage.setItem("workspace-layout", JSON.stringify(layout));
  };

  // Run Code state (unified — runs against customInput textarea)
  const [customInput, setCustomInput] = useState(sampleInput);
  const [runJobId, setRunJobId] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runPolling, setRunPolling] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);



  const resetExecutionState = () => {
    executionVersion.current++;
    setRunJobId(null);
    setRunResult(null);
    setRunStatus(null);
    setSubmissionId(null);
    setSubmission(null);
    setSubmissionStatus(null);
  };

  const handleLangChange = (lang: string) => {
    resetExecutionState();
    setLanguage(lang);
    setTerminalTab('testcases');
    const entry = LANGUAGES.find((l) => l.value === lang);
    if (entry) {
      if (authState === 'UNKNOWN') return;
      const identity = authState === 'AUTHENTICATED' ? userId! : 'guest';
      const stored = localStorage.getItem(`codeforge:draft:${identity}:${problemId}:${lang}`);
      setCode(stored ?? entry.starter);
    }
  };

  const handleResetCode = () => {
    if (!window.confirm("Reset to default template? Your draft will be cleared.")) return;
    const entry = LANGUAGES.find((l) => l.value === language);
    const starter = entry ? entry.starter : "";
    setCode(starter);
    if (authState !== 'UNKNOWN') {
      const identity = authState === 'AUTHENTICATED' ? userId! : 'guest';
      localStorage.removeItem(`codeforge:draft:${identity}:${problemId}:${language}`);
    }
  };

  // ── Auth-aware draft & input persistence ──────────────────────────────────
  // All localStorage reads and writes are blocked until authState resolves.
  // Keys use identity-scoped namespaces to prevent cross-user data leakage.
  useEffect(() => {
    if (authState === 'UNKNOWN') return; // Block until identity is known
    const identity = authState === 'AUTHENTICATED' ? userId! : 'guest';

    // ── Guest → User migration (runs once when AUTHENTICATED resolves) ──────
    if (authState === 'AUTHENTICATED') {
      for (const lang of LANGUAGES.map((l) => l.value)) {
        const guestKey = `codeforge:draft:guest:${problemId}:${lang}`;
        const userKey  = `codeforge:draft:${identity}:${problemId}:${lang}`;
        const guestDraft = localStorage.getItem(guestKey);
        if (guestDraft !== null) {
          // User's existing draft wins; only copy if user has no draft
          if (localStorage.getItem(userKey) === null) {
            localStorage.setItem(userKey, guestDraft);
          }
          localStorage.removeItem(guestKey); // Always clean up guest key
        }
      }
      // Migrate custom input too
      const guestInputKey = `codeforge:input:guest:${problemId}`;
      const userInputKey  = `codeforge:input:${identity}:${problemId}`;
      const guestInput = localStorage.getItem(guestInputKey);
      if (guestInput !== null) {
        if (localStorage.getItem(userInputKey) === null) {
          localStorage.setItem(userInputKey, guestInput);
        }
        localStorage.removeItem(guestInputKey);
      }
    }

    // ── Load draft for current problem/language ───────────────────────────
    const draftKey = `codeforge:draft:${identity}:${problemId}:${language}`;
    const stored = localStorage.getItem(draftKey);
    if (stored !== null) {
      setCode((prev) => (stored !== prev ? stored : prev));
    }

    // ── Load custom input ─────────────────────────────────────────────────
    const inputKey = `codeforge:input:${identity}:${problemId}`;
    const storedInput = localStorage.getItem(inputKey);
    if (storedInput !== null) {
      setCustomInput((prev) => (storedInput !== prev ? storedInput : prev));
    } else if (sampleInput) {
      setCustomInput((prev) => (sampleInput !== prev ? sampleInput : prev));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, userId, problemId, language, sampleInput]);
  // setCode and setCustomInput are stable; excluded intentionally.
  // Migration only needs authState/userId to change, not every code keystroke.

  // ── Autosave code ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState === 'UNKNOWN') return;
    const identity = authState === 'AUTHENTICATED' ? userId! : 'guest';
    localStorage.setItem(`codeforge:draft:${identity}:${problemId}:${language}`, code);
  }, [authState, userId, problemId, language, code]);

  // ── Autosave custom input ─────────────────────────────────────────────────
  useEffect(() => {
    if (authState === 'UNKNOWN') return;
    const identity = authState === 'AUTHENTICATED' ? userId! : 'guest';
    localStorage.setItem(`codeforge:input:${identity}:${problemId}`, customInput);
  }, [authState, userId, problemId, customInput]);

  // ── Submission polling (recursive setTimeout — no overlap) ────────────────
  useEffect(() => {
    if (!submissionId) return;
    const version = executionVersion.current;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setPolling(true);

    async function pollSubmission() {
      if (cancelled || version !== executionVersion.current) return;
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (cancelled || version !== executionVersion.current) return;
        if (!res.ok) {
          if (res.status === 401) {
            setPolling(false);
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
          }
          if (res.status === 404 || res.status >= 500) {
            setPolling(false);
            return;
          }
          // Transient error (429, 503 etc): schedule retry
        } else {
          const data = await res.json() as { submission?: Submission } | Submission;
          const sub: Submission = (data as { submission?: Submission }).submission ?? (data as Submission);
          setSubmission(sub);
          setSubmissionStatus(sub.status);
          if (TERMINAL.has(sub.status)) {
            setPolling(false);
            setShowModal(true);
            return; // Terminal state — stop polling
          }
        }
      } catch {
        // Network failure — retry after delay
      }
      if (!cancelled && version === executionVersion.current) {
        timeoutId = setTimeout(pollSubmission, POLL_MS);
      }
    }

    pollSubmission();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [submissionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setLoading(true);
    setError(null);
    setSubmission(null);
    setSubmissionId(null);
    setSubmissionStatus("QUEUED");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId, code, language }),
      });
      const data = await res.json() as {
        submissionId?: string;
        submission?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");

      const sid = data.submissionId ?? data.submission?.id;
      if (!sid) throw new Error("Submission ID missing from response");
      setSubmissionId(sid);
      setSubmissionStatus("QUEUED");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
      submissionLock.current = false;
    }
  }

  async function handleRun() {
    if (runLock.current) return; // runLock is independent of submissionLock
    runLock.current = true;
    setRunLoading(true);
    setRunResult(null);
    setRunStatus("QUEUED");
    setError(null);
    // Switch to Output tab so user sees progress immediately
    setTerminalTab('output');

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Uses the live customInput textarea (pre-filled with sampleInput)
        body: JSON.stringify({ language, code, customInput }),
      });
      if (res.status === 401 || res.status === 403) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json() as { jobId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      if (!data.jobId) throw new Error("Job ID missing");

      setRunJobId(data.jobId);
      setRunStatus("QUEUED");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Run failed");
      setRunLoading(false);
    } finally {
      runLock.current = false; // Always release in finally
    }
  }

  // ── Run polling (recursive setTimeout — no overlap) ───────────────────────
  useEffect(() => {
    if (!runJobId) return;
    const version = executionVersion.current;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setRunPolling(true);
    setRunLoading(false);

    async function pollRun() {
      if (cancelled || version !== executionVersion.current) return;
      try {
        const res = await fetch(`/api/run-status/${runJobId}`);
        if (cancelled || version !== executionVersion.current) return;
        if (!res.ok) {
          if (res.status === 401) {
            setRunPolling(false);
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            return;
          }
          if (res.status === 404 || res.status >= 500) {
            setRunPolling(false);
            return;
          }
          // Transient error: retry
        } else {
          const data = await res.json() as { status?: string; stdout?: string; stderr?: string; executionTimeMs?: number; exitCode?: number; outputTruncated?: boolean; error?: string; errorType?: "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT" | "INFRA_ERROR" | "NONE" | null };
          if (data.status) setRunStatus(data.status);
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            setRunResult(data as RunResult);
            setRunPolling(false);
            return; // Terminal state — stop polling
          }
        }
      } catch {
        // Network failure — stop polling
        setRunPolling(false);
        return;
      }
      if (!cancelled && version === executionVersion.current) {
        timeoutId = setTimeout(pollRun, POLL_MS);
      }
    }

    pollRun();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [runJobId]);



  const isBusy = loading || polling;

  return (
    <>
      {showModal && submission && (
        <ResultModal submission={submission} onClose={() => setShowModal(false)} nextProblemId={nextProblemId} />
      )}

      <div className="flex flex-col h-full">
        {/* Toolbar: Language Selector + Reset Code */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--color-forge-border)", background: "rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-forge-muted)" }}>Editor</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Reset to boilerplate */}
            <button
              onClick={handleResetCode}
              disabled={isBusy}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 rounded-md hover:bg-slate-800"
              title="Reset to default code (Ctrl+Shift+R)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
            {/* Language selector */}
            <div className="relative">
              <select
                value={language}
                onChange={(e) => handleLangChange(e.target.value)}
                className="forge-select text-xs font-medium pl-3 pr-8 py-1.5 rounded-md border transition-colors appearance-none cursor-pointer hover:border-cyan-500/50 focus:border-cyan-400"
                style={{
                  background: "var(--color-forge-surface)",
                  border: "1px solid var(--color-forge-border)",
                  color: "var(--color-forge-text)",
                  outline: "none",
                }}
                disabled={isBusy}
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area: Resizable vertical split */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          {!(isMounted && isMobile) ? (
          <div className="flex flex-1 min-h-0">
            <Group
              orientation="vertical"
              className="h-full w-full"
              groupRef={panelGroupRef}
              onLayoutChange={handleLayoutChange}
            >
              {/* Top Panel: Monaco Editor */}
              <Panel defaultSize={65} minSize={20} className="flex flex-col">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language={language}
                  height="100%"
                  onRun={handleRun}
                  onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                />
              </Panel>

              {/* Resize handle */}
              <Separator className="h-1.5 bg-[var(--color-forge-surface)] hover:bg-[var(--color-forge-border)] active:bg-[#22d3ee]/30 transition-colors cursor-row-resize flex flex-row justify-center items-center group z-10 relative">
                <div className="w-6 h-0.5 rounded-full bg-[var(--color-forge-muted)] group-hover:bg-[var(--color-forge-muted)] transition-colors" />
              </Separator>

              {/* Bottom Panel: Terminal (Testcases + Output tabs) */}
              <Panel defaultSize={35} minSize={10} className="flex flex-col bg-[#0f172a] overflow-hidden">
                {/* Terminal tab bar */}
                <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-forge-border)", background: "rgba(0,0,0,0.2)" }}>
                  <button
                    type="button"
                    onClick={() => setTerminalTab('testcases')}
                    className="px-4 py-2 text-xs font-semibold border-b-2 transition-colors"
                    style={{
                      color: terminalTab === 'testcases' ? '#22d3ee' : 'var(--color-forge-muted)',
                      borderBottomColor: terminalTab === 'testcases' ? '#22d3ee' : 'transparent',
                    }}
                  >
                    Testcases
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerminalTab('output')}
                    className="px-4 py-2 text-xs font-semibold border-b-2 transition-colors"
                    style={{
                      color: terminalTab === 'output' ? '#22d3ee' : 'var(--color-forge-muted)',
                      borderBottomColor: terminalTab === 'output' ? '#22d3ee' : 'transparent',
                    }}
                  >
                    Output
                  </button>
                  {runResult && (
                    <div className="ml-auto flex items-center pr-2">
                      <button
                        onClick={() => { setRunResult(null); setRunStatus(null); setTerminalTab('testcases'); }}
                        className="text-xs px-2 py-1 transition-colors hover:text-[#f8fafc]"
                        style={{ color: "var(--color-forge-muted)" }}
                        title="Clear output"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Terminal content */}
                <div className="flex-1 overflow-auto p-4">
                  {terminalTab === 'testcases' ? (
                    // Stdin textarea — editable, defaults to sampleInput
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Enter stdin for your code…"
                      className="w-full h-full p-3 rounded-lg font-mono text-sm resize-none focus:outline-none focus:border-[#22d3ee]"
                      style={{
                        background: "var(--color-forge-bg)",
                        border: "1px solid var(--color-forge-muted)",
                        color: "var(--color-forge-text)",
                        minHeight: "80px",
                      }}
                    />
                  ) : (
                    // Output tab
                    !runResult ? (
                      (runStatus || runLoading) ? (
                        <div className="h-full w-full flex flex-col items-center justify-center opacity-80">
                          <svg className="animate-spin-forge w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic h-full flex flex-col items-center justify-center">
                          <svg className="w-10 h-10 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          Run your code to see output here.
                        </div>
                      )
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center gap-4 mb-2">
                            <div className="text-xs font-semibold" style={{ color: "var(--color-forge-muted)" }}>Stdout</div>
                            {runResult.executionTimeMs != null && (
                              <div className="text-xs font-mono" style={{ color: "var(--color-forge-muted)" }}>
                                Time: <strong style={{ color: "var(--color-forge-muted)" }}>{runResult.executionTimeMs}ms</strong>
                              </div>
                            )}
                          </div>
                          <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "var(--color-forge-bg)", color: "#cbd5e1", minHeight: "2.5rem" }}>
                            {runResult.stdout || "(empty)"}
                          </pre>
                        </div>
                        {runResult.stderr && (
                          <div>
                            <div className="text-xs font-semibold mb-2" style={{ color: "#f43f5e" }}>Stderr</div>
                            <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e", minHeight: "2.5rem" }}>
                              {runResult.stderr}
                            </pre>
                          </div>
                        )}
                        {runResult.error && !runResult.errorType && (
                          <div className="text-xs p-3 rounded-lg" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}>
                            {runResult.error}
                          </div>
                        )}
                        {runResult.outputTruncated && (
                          <div className="text-xs p-3 rounded-lg font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                            ⚠ Output truncated due to size limits.
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </Panel>
            </Group>
          </div>
          ) : (
          <div className="flex flex-col flex-1 min-h-0 bg-[#0a1120]">
            {/* Mobile Tab Bar */}
            <div className="flex shrink-0 bg-[var(--color-forge-surface)] border-b border-[var(--color-forge-border)]">
              <button
                onClick={() => setTerminalTab('testcases')}
                className={`flex-1 py-3 text-xs font-semibold ${terminalTab === 'testcases' ? 'text-[#22d3ee] border-b-2 border-[#22d3ee]' : 'text-slate-400'}`}
              >
                Editor / Input
              </button>
              <button
                onClick={() => setTerminalTab('output')}
                className={`flex-1 py-3 text-xs font-semibold ${terminalTab === 'output' ? 'text-[#22d3ee] border-b-2 border-[#22d3ee]' : 'text-slate-400'}`}
              >
                Output
              </button>
            </div>

            {/* Mobile Content */}
            <div className="flex-1 min-h-0 relative flex overflow-hidden">
              {/* Testcases Tab (Code Editor + Stdin) */}
              <div
                className="w-full h-full shrink-0 flex flex-col overflow-y-auto transition-transform duration-300"
                style={{ transform: terminalTab === 'testcases' ? 'translateX(0)' : 'translateX(-100%)' }}
              >
                <div className="h-[50vh] shrink-0 border-b border-[var(--color-forge-border)]">
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={language}
                    height="100%"
                    onRun={handleRun}
                    onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                  />
                </div>
                <div className="flex-1 p-4 bg-[#0f172a]">
                  <label className="text-xs font-semibold text-slate-400 mb-2 block">Stdin (Custom Input)</label>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter stdin for your code…"
                    className="w-full min-h-[120px] p-3 rounded-lg font-mono text-sm resize-y focus:outline-none focus:border-[#22d3ee]"
                    style={{ background: "var(--color-forge-bg)", border: "1px solid var(--color-forge-muted)", color: "var(--color-forge-text)" }}
                  />
                </div>
              </div>

              {/* Output Tab */}
              <div
                className="w-full h-full shrink-0 flex flex-col overflow-y-auto bg-[#0f172a] p-4 transition-transform duration-300"
                style={{ transform: terminalTab === 'testcases' ? 'translateX(0)' : 'translateX(-100%)' }}
              >
                {!runResult ? (
                  (runStatus || runLoading) ? (
                    <div className="h-full w-full flex flex-col items-center justify-center opacity-80">
                      <svg className="animate-spin-forge w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic h-full flex flex-col items-center justify-center">
                      <svg className="w-10 h-10 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      Run your code to see output here.
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <div className="text-xs font-semibold" style={{ color: "var(--color-forge-muted)" }}>Stdout</div>
                        {runResult.executionTimeMs != null && (
                          <div className="text-xs font-mono" style={{ color: "var(--color-forge-muted)" }}>
                            Time: <strong style={{ color: "var(--color-forge-muted)" }}>{runResult.executionTimeMs}ms</strong>
                          </div>
                        )}
                      </div>
                      <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "var(--color-forge-bg)", color: "#cbd5e1", minHeight: "2.5rem" }}>
                        {runResult.stdout || "(empty)"}
                      </pre>
                    </div>

                    {runResult.stderr && (
                      <div>
                        <div className="text-xs font-semibold mb-2" style={{ color: "#f43f5e" }}>Stderr</div>
                        <pre className="p-3 rounded-lg text-xs overflow-auto font-mono" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e", minHeight: "2.5rem" }}>
                          {runResult.stderr}
                        </pre>
                      </div>
                    )}

                    {runResult.error && !runResult.errorType && (
                      <div className="text-xs p-3 rounded-lg" style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}>
                        {runResult.error}
                      </div>
                    )}

                    {runResult.outputTruncated && (
                      <div className="text-xs p-3 rounded-lg font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                        ⚠ Output truncated due to size limits.
                      </div>
                    )}
                  </div>
                )}
              </div>
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

        {/* Footer: Status Pills + Action Buttons */}
        <div
          className="shrink-0 px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--color-forge-border)", background: "rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center gap-2">
            {submissionStatus && <StatusPill label="Submission" status={submissionStatus} />}
            {runStatus && <StatusPill label="Run" status={runStatus} />}
          </div>
          <div className="flex items-center gap-2">
            {/* Run Code Button — always uses customInput textarea */}
            <button
              onClick={handleRun}
              disabled={runLoading || runPolling || !code.trim()}
              className="forge-btn-primary flex items-center gap-2 text-sm"
              style={{ padding: "0.45rem 1.25rem" }}
              title="Run Code (Ctrl+Enter)"
            >
              {runLoading || runPolling ? (
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

            {/* Submit Button */}
            <form onSubmit={handleSubmit} style={{ display: "inline" }}>
              <button
                type="submit"
                disabled={isBusy || !code.trim()}
                className="forge-btn-primary flex items-center gap-2 text-sm"
                style={{ padding: "0.45rem 1.25rem" }}
                title="Submit (Ctrl+Shift+Enter)"
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
