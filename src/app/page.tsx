"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const STATIC_STATS = [
  { label: "Languages", value: "5" },
  { label: "Async Queue", value: "Queue-backed" },
];

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "Real Code Execution",
    desc: "Submit code in JavaScript or C++ and see it run against hidden test cases in a sandboxed environment.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: "Async Evaluation",
    desc: "Submissions are queued through a dedicated async worker and processed in isolation — no blocking the HTTP thread.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    title: "Instant Feedback",
    desc: "Per-test-case results with stdout, expected vs actual output, and pass/fail status.",
  },
];

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [problemCount, setProblemCount] = useState<number | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
           const data = await res.json();
           setAuthed(data.authenticated);
        } else {
           setAuthed(false);
        }
      } catch {
        setAuthed(false);
      }
    };
    
    const timer = setTimeout(checkAuth, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProblemCount = async () => {
      try {
        const res = await fetch("/api/problems", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { count?: number; problems?: Array<unknown> };
        const count = typeof data.count === "number"
          ? data.count
          : Array.isArray(data.problems)
            ? data.problems.length
            : null;
        if (!cancelled) {
          setProblemCount(count);
        }
      } catch {
        if (!cancelled) {
          setProblemCount(null);
        }
      }
    };

    void loadProblemCount();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="w-full max-w-7xl mx-auto px-6 py-16 animate-fade-in">
      {/* Hero */}
      <div className="text-center mb-16">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 animate-slide-down"
          style={{
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.3)",
            color: "var(--color-forge-cyan)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Asynchronous Code Execution Platform
        </div>

        <h1
          className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5 animate-slide-down"
          style={{ color: "var(--color-forge-text)", letterSpacing: "-0.03em", animationDelay: "0.05s" }}
        >
          Forge your{" "}
          <span
            style={{
              background: "linear-gradient(135deg, var(--color-forge-cyan-dim, #0891b2), var(--color-forge-cyan))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            code
          </span>
        </h1>

        <p
          className="text-lg max-w-2xl mx-auto mb-10 animate-fade-in"
          style={{ color: "var(--color-forge-muted)", animationDelay: "0.1s" }}
        >
          Solve algorithmic problems, submit your code, and watch it evaluated in real-time
          against comprehensive test suites.
        </p>

        <div className="flex flex-wrap gap-4 justify-center animate-pop" style={{ animationDelay: "0.15s" }}>
          <Link href="/problems" className="forge-btn-primary text-base" style={{ padding: "0.65rem 1.75rem" }}>
            Browse Problems →
          </Link>
          {!authed && (
            <Link href="/register" className="forge-btn-ghost text-base" style={{ padding: "0.65rem 1.75rem" }}>
              Create Account
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-16 stagger-children">
        {[{ label: "Problems", value: problemCount == null ? "—" : String(problemCount) }, ...STATIC_STATS].map(({ label, value }) => (
          <div key={label} className="forge-card text-center py-5 px-4">
            <div className="text-2xl font-extrabold mb-1" style={{ color: "var(--color-forge-cyan)" }}>{value}</div>
            <div className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--color-forge-muted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Glow divider */}
      <div className="forge-glow-line mb-16 opacity-50" />

      {/* Features */}
      <div className="grid sm:grid-cols-3 gap-6 stagger-children">
        {FEATURES.map(({ icon, title, desc }) => (
          <div key={title} className="forge-card-hover p-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "rgba(34,211,238,0.1)", color: "var(--color-forge-cyan)" }}
            >
              {icon}
            </div>
            <h3 className="font-bold text-base mb-2" style={{ color: "var(--color-forge-text)" }}>{title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-forge-muted)" }}>{desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
