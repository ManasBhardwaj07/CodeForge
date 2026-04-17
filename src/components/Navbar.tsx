"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";

export function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsAuthenticated(!!token);
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUsername(payload.username || payload.email || "User");
      } catch {
        setUsername("User");
      }
    } else {
      setUsername(null);
    }
  }, []);

  return (
    <nav className="w-full bg-gradient-to-r from-gray-900 via-blue-900 to-gray-800 text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50 animate-navbar-fade">
      <div className="flex items-center space-x-8">
        <Link href="/" className="font-extrabold text-2xl tracking-tight hover:text-blue-300 transition-all duration-150">CodeForge</Link>
        <Link href="/problems" className="hover:text-blue-300 transition">Problems</Link>
        <Link href="/submissions" className="hover:text-blue-300 transition">Submissions</Link>
      </div>
      <div className="flex items-center space-x-6">
        {isAuthenticated ? (
          <>
            <span className="font-semibold text-blue-200 bg-blue-900/60 px-3 py-1 rounded-lg shadow animate-slide-right">{username}</span>
            <button
              className="bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-lg text-sm font-semibold shadow transition-all duration-150 animate-pop"
              onClick={() => {
                localStorage.removeItem("token");
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:text-blue-300 transition">Login</Link>
            <Link href="/register" className="hover:text-blue-300 transition">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
