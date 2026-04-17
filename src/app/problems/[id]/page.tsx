// src/app/problems/[id]/page.tsx
// FIX 1: Removed "use client" — this is now a proper Server Component.
// FIX 2: params is typed as Promise<{id}> and awaited (required in Next.js 15).
// FIX 3: Fetching is done server-side via the new /api/problems/[id] route.
// FIX 4: All interactive/stateful UI is delegated to <ProblemSolver> (client component).
// FIX 5: Removed all duplicate JSX blocks that were stray code outside functions.
// FIX 6: Proper not-found and error handling with user-facing messages.

import React from "react";
import { ProblemSolver } from "@/components/ProblemSolver";

type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
};

// ─── Data Fetching ──────────────────────────────────────────────────────────
// Calls the new /api/problems/[id] route (see src/app/api/problems/[id]/route.ts).
// Falls back gracefully — never throws to the page boundary.
async function getProblem(id: string): Promise<Problem | null> {
  try {
    // In Next.js App Router server components, an absolute URL is required for
    // fetch(). Use NEXT_PUBLIC_BASE_URL in production (e.g. "https://yourapp.com").
    // Falls back to localhost for local development.
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    const res = await fetch(`${base}/api/problems/${id}`, {
      cache: "no-store",
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return (await res.json()) as Problem;
  } catch {
    return null;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
// params is Promise<{id}> in Next.js 15; awaiting it is backward-compatible
// with Next.js 14 where params is a plain object (awaiting a non-Promise is a no-op).
export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problem = await getProblem(id);

  if (!problem) {
    return (
      <main className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-red-600" role="alert">
          Problem not found or failed to load. Please try again.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      {/* Static problem info rendered server-side */}
      <h1 className="text-2xl font-bold mb-2">{problem.title}</h1>
      <div className="mb-4 text-gray-700 whitespace-pre-line">
        {problem.description}
      </div>
      <div className="mb-4">
        <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
          {problem.difficulty}
        </span>
      </div>

      {/* All hooks, state, and interactivity live in this client component */}
      <ProblemSolver problemId={problem.id} />
    </main>
  );
}
