"use client";
import { useState } from "react";
import Link from "next/link";
import { setToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [mode, setMode] = useState<"username" | "email">("username");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError(mode === "email" ? "Email is required." : "Username is required.");
      return;
    }
    if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const body = mode === "email"
        ? { email: identifier, password }
        : { username: identifier, password };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? "Login failed");
        return;
      }
      setToken(data.token);
      window.dispatchEvent(new Event("storage"));
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-md forge-card animate-pop p-8"
        style={{ boxShadow: "0 0 60px rgba(34,211,238,0.06)" }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold mb-1.5" style={{ color: "#e2e8f0" }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: "#64748b" }}>
            Sign in to continue coding
          </p>
        </div>

        {/* Mode toggle */}
        <div
          className="flex mb-6 rounded-lg p-1 gap-1"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid #1e3058" }}
        >
          {(["username", "email"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setIdentifier(""); setError(null); }}
              className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
              style={{
                background: mode === m ? "rgba(34,211,238,0.15)" : "transparent",
                color: mode === m ? "#22d3ee" : "#64748b",
                border: mode === m ? "1px solid rgba(34,211,238,0.3)" : "1px solid transparent",
              }}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <form className="space-y-5" onSubmit={handleLogin} noValidate>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>
              {mode === "email" ? "Email" : "Username"}
            </label>
            <input
              type={mode === "email" ? "email" : "text"}
              className="forge-input"
              placeholder={mode === "email" ? "you@example.com" : "your_username"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete={mode === "email" ? "email" : "username"}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className="forge-input pr-10"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#64748b" }}
                tabIndex={-1}
              >
                {showPw ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm animate-shake"
              style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", color: "#f43f5e" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="forge-btn-primary w-full py-2.5 text-sm font-bold"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin-forge" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Signing in…
              </span>
            ) : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "#64748b" }}>
          No account?{" "}
          <Link href="/register" className="font-semibold" style={{ color: "#22d3ee" }}>
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
