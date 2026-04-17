"use client";
import { useState } from "react";
import { setToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Client-side validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!username || username.length < 3 || username.length > 32) {
      setError("Username must be 3-32 characters.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setError(data.error || "Registration failed");
        return;
      }
      // Registration success: redirect to login page
      router.replace("/login");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    }
  }

  return (
    <main className="max-w-sm mx-auto mt-16 p-8 rounded-2xl shadow-2xl bg-gradient-to-br from-white to-blue-50 animate-fade-in border border-blue-100">
      <h1 className="text-4xl font-extrabold mb-6 text-center text-blue-700 tracking-tight drop-shadow animate-slide-down">Create your account</h1>
      <form className="space-y-6" onSubmit={handleRegister}>
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
        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input
            type="text"
            className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-400 transition"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-400 transition"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <div className="text-red-600 text-sm text-center animate-shake">{error}</div>}
        <button type="submit" className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-4 py-2 rounded-lg w-full font-semibold shadow transition-all duration-200 transform hover:scale-105">Register</button>
      </form>
      <div className="mt-6 text-sm text-center">
        Already have an account? <a href="/login" className="text-blue-600 underline hover:text-blue-800 transition">Login</a>
      </div>
    </main>
  );
}
