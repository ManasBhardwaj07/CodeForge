"use client";
import Link from "next/link";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

function parseTokenState(token: string | null): { isAuthenticated: boolean; username: string | null } {
  if (!token) return { isAuthenticated: false, username: null };
  try {
    const parts = token.split(".");
    const part = parts[1];
    if (!part) return { isAuthenticated: true, username: "User" };
    const payload = JSON.parse(atob(part)) as { username?: string; email?: string };
    return { isAuthenticated: true, username: payload.username ?? payload.email ?? "User" };
  } catch {
    return { isAuthenticated: true, username: "User" };
  }
}

function readLocalStorage(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function Navbar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
  const sync = () => {
    const { isAuthenticated: a, username: u } = parseTokenState(readLocalStorage());
    setIsAuthenticated(a);
    setUsername(u);
  };

  sync();
  setMounted(true);

  window.addEventListener("storage", sync);
  return () => window.removeEventListener("storage", sync);
}, []);

  const navLinks = [
    { href: "/problems", label: "Problems" },
    { href: "/submissions", label: "Submissions" },
  ];

  return (
    <nav
      style={{
        background: "linear-gradient(to right, #060b18, #0a1628, #060b18)",
        borderBottom: "1px solid #1e3058",
      }}
      className="sticky top-0 z-50 w-full"
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: "#22d3ee", letterSpacing: "-0.02em" }}
          >
            &lt;/&gt;
          </span>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ color: "#e2e8f0" }}
          >
            Code
            <span style={{ color: "#22d3ee" }}>Forge</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
                style={{
                  color: active ? "#22d3ee" : "#94a3b8",
                }}
              >
                {label}
                {active && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                    style={{ background: "#22d3ee" }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Auth area */}
        <div className="flex items-center gap-3">
          {mounted && isAuthenticated ? (
            <>
              <span
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full animate-slide-right"
                style={{
                  background: "rgba(34,211,238,0.1)",
                  border: "1px solid rgba(34,211,238,0.25)",
                  color: "#22d3ee",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                </svg>
                {username}
              </span>
              <button
                className="forge-btn-ghost text-sm"
                style={{ borderColor: "rgba(244,63,94,0.4)", color: "#f43f5e", padding: "0.35rem 1rem" }}
                onClick={() => {
                  localStorage.removeItem("token");
                  window.dispatchEvent(new Event("storage"));
                  window.location.href = "/login";
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
                style={{ color: "#94a3b8" }}
              >
                Login
              </Link>
              <Link
                href="/register"
                className="forge-btn-primary text-sm"
                style={{ padding: "0.35rem 1rem" }}
              >
                Register
              </Link>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            className="sm:hidden p-2 rounded-lg"
            style={{ color: "#94a3b8" }}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <path d="M18 6L6 18M6 6l12 12"/>
                : <path d="M3 12h18M3 6h18M3 18h18"/>}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="sm:hidden animate-slide-down px-4 pb-4 flex flex-col gap-2"
          style={{ borderTop: "1px solid #1e3058", background: "#060b18" }}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="py-2.5 text-sm font-medium"
              style={{ color: "#94a3b8" }}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
