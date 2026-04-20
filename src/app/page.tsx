"use client";
import Link from "next/link";
import { useState } from "react";
import { getToken } from "@/lib/auth-client";

const STATS = [
  { label: "Problems", value: "8+" },
  { label: "Languages", value: "2" },
  { label: "Async Queue", value: "BullMQ" },
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
    desc: "Submissions are queued via BullMQ and processed by an isolated worker — no blocking the HTTP thread.",
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
const [authed] = useState<boolean>(() => !!getToken());

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 animate-fade-in">
      {/* Hero */}
      <div className="text-center mb-16">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 animate-slide-down"
          style={{
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.3)",
            color: "#22d3ee",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Asynchronous Code Execution Platform
        </div>

        <h1
          className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5 animate-slide-down"
          style={{ color: "#e2e8f0", letterSpacing: "-0.03em", animationDelay: "0.05s" }}
        >
          Forge your{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #22d3ee, #06b6d4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            code
          </span>
        </h1>

        <p
          className="text-lg max-w-2xl mx-auto mb-10 animate-fade-in"
          style={{ color: "#64748b", animationDelay: "0.1s" }}
        >
          Solve algorithmic problems, submit your code, and watch it evaluated in real-time
          against comprehensive test suites.
        </p>

        <div className="flex flex-wrap gap-4 justify-center animate-pop" style={{ animationDelay: "0.15s" }}>
          <Link href="/problems" className="forge-btn-primary text-base" style={{ padding: "0.65rem 1.75rem" }}>
            Browse Problems →
          </Link>
          {authed === false && (
            <Link href="/register" className="forge-btn-ghost text-base" style={{ padding: "0.65rem 1.75rem" }}>
              Create Account
            </Link>
          )}
          {authed === true && (
            <Link href="/submissions" className="forge-btn-ghost text-base" style={{ padding: "0.65rem 1.75rem" }}>
              My Submissions
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-16 stagger-children">
        {STATS.map(({ label, value }) => (
          <div key={label} className="forge-card text-center py-5 px-4">
            <div className="text-2xl font-extrabold mb-1" style={{ color: "#22d3ee" }}>{value}</div>
            <div className="text-xs font-medium uppercase tracking-widest" style={{ color: "#64748b" }}>{label}</div>
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
              style={{ background: "rgba(34,211,238,0.1)", color: "#22d3ee" }}
            >
              {icon}
            </div>
            <h3 className="font-bold text-base mb-2" style={{ color: "#e2e8f0" }}>{title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
