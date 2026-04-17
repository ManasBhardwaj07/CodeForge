"use client";
import { useState } from "react";
import { setToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Client-side validation
    if (showEmailLogin) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
    } else {
      if (!username || username.length < 3 || username.length > 32) {
        setError("Username must be 3-32 characters.");
        return;
      }
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      let body;
      if (showEmailLogin) {
        body = { email, password };
      } else {
        body = { username, password };
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setError(data.error || "Login failed");
        return;
      }
      setToken(data.token);
      router.replace("/"); // Redirect to home after login
    } catch (err: any) {
      setError(err.message || "Unknown error");
    }
  }

  return (
    <main className="max-w-sm mx-auto mt-16 p-8 rounded-2xl shadow-2xl bg-gradient-to-br from-white to-blue-50 animate-fade-in border border-blue-100">
      <h1 className="text-4xl font-extrabold mb-6 text-center text-blue-700 tracking-tight drop-shadow animate-slide-down">Sign in to your account</h1>
      <form className="space-y-6" onSubmit={handleLogin}>
        {showEmailLogin ? (
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-400 transition"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-400 transition"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-400 transition"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-between items-center text-sm">
          <button
            type="button"
            className="text-blue-600 hover:underline focus:outline-none"
            onClick={() => setShowEmailLogin(s => !s)}
          >
            {showEmailLogin ? "Login with Username" : "Login with Email"}
          </button>
          <span className="text-gray-400 cursor-not-allowed" title="Feature coming soon">Forgot password?</span>
        </div>
        {error && <div className="text-red-600 text-sm text-center animate-shake">{error}</div>}
        <button type="submit" className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-4 py-2 rounded-lg w-full font-semibold shadow transition-all duration-200 transform hover:scale-105">Login</button>
      </form>
      <div className="mt-6 text-sm text-center">
        Don&apos;t have an account? <a href="/register" className="text-blue-600 underline hover:text-blue-800 transition">Register</a>
      </div>
    </main>
  );
}
