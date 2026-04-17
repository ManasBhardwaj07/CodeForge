"use client";

import React, { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-client";

type Submission = {
  id: string;
  verdict: string | null;
  createdAt: string;
  problem?: {
    title?: string;
  };
};

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = getToken();

        if (!token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("/api/my-submissions", {
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login";
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to fetch submissions");
        }

        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } catch {
        setError("Could not load submissions.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <div className="p-4">Loading submissions...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="p-4 text-gray-600">No submissions found.</div>;
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Submission History</h1>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Problem</th>
            <th className="p-2 text-left">Verdict</th>
            <th className="p-2 text-left">Created</th>
          </tr>
        </thead>

        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2 font-mono">{s.id}</td>
              <td className="p-2">{s.problem?.title ?? "-"}</td>
              <td className="p-2">{s.verdict ?? "-"}</td>
              <td className="p-2">
                {new Date(s.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}