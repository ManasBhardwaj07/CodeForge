"use client";
import Link from "next/link";
import React, { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

export function Navbar({ user }: { user: { userId: string; email: string; username: string } | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthenticated = !!user;
  const username = user?.username ?? user?.email ?? "User";
  const isAuthPage = pathname === "/login" || pathname === "/register";

  const nextParam = encodeURIComponent(pathname || "/");

  const navLinks = [
    { href: "/problems", label: "Problems" },
    { href: "/submissions", label: "Submissions" },
  ];

  return (
    <nav
      style={{
        background: "var(--color-forge-surface)",
        borderBottom: "1px solid var(--color-forge-border)",
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
            style={{ color: "var(--color-forge-text)" }}
          >
            Code
            <span style={{ color: "#22d3ee" }}>Forge</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        {!isAuthPage && (
        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
                style={{
                  color: active ? "#22d3ee" : "var(--color-forge-muted)",
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
        )}

        {/* Auth area */}
        {!isAuthPage && (
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "var(--color-forge-surface)", border: "1px solid var(--color-forge-border)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(34,211,238,0.1)", color: "var(--color-forge-cyan)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-semibold tracking-wide" style={{ color: "var(--color-forge-text)" }}>
                    {username}
                  </span>
                </div>

                <button
                  className="forge-btn-ghost text-sm flex items-center justify-center p-1.5 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 group transition-all"
                  style={{ color: "var(--color-forge-muted)", padding: "0.4rem 0.5rem" }}
                  title="Logout"
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout", { method: "POST" });
                    } catch (e) {
                      console.error("Logout failed", e);
                    }
                    window.location.href = "/login";
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-hover:translate-x-0.5">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                href={`/login?next=${nextParam}`}
                className="text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
                style={{ color: "var(--color-forge-muted)" }}
              >
                Login
              </Link>
              <Link
                href={`/register?next=${nextParam}`}
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
            style={{ color: "var(--color-forge-muted)" }}
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
        )}
      </div>

      {/* Mobile dropdown */}
      {!isAuthPage && menuOpen && (
        <div
          className="sm:hidden animate-slide-down px-4 pb-4 flex flex-col gap-2"
          style={{ borderTop: "1px solid var(--color-forge-border)", background: "var(--color-forge-bg)" }}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="py-2.5 text-sm font-medium"
              style={{ color: "var(--color-forge-muted)" }}
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
