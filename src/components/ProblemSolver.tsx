"use client";

import React, { useEffect, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { SubmissionStatus } from "@/components/SubmissionStatus";
import { getToken } from "@/lib/auth-client";

const LANGUAGES = [
  { value: "JAVASCRIPT", label: "JavaScript" },
  { value: "CPP", label: "C++" },
];

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);
const POLL_INTERVAL_MS = 2000;

type ExecutionResult = {
  id?: string;
  testCaseId?: string;
  inputSnapshot?: string;
  expectedOutputSnapshot?: string;
  actualOutput?: string;
  stderr?: string;
  passed?: boolean;
};

type Submission = {
  id: string;
  status: string;
  verdict?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  executionResults?: ExecutionResult[];
};

function TruncatedText({
  text,
  max = 300,
}: {
  text?: string | null;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return <span>-</span>;
  if (text.length <= max) return <span>{text}</span>;

  return (
    <span>
      {expanded ? text : `${text.slice(0, max)}...`}
      <button
        type="button"
        className="ml-2 text-blue-600 underline"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </span>
  );
}

function SubmissionResults({
  submission,
}: {
  submission: Submission;
}) {
  const results = submission.executionResults ?? [];

  if (results.length === 0) {
    return (
      <div className="mt-4 text-sm text-gray-500">
        No test cases executed.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <h3 className="mb-2 font-semibold text-sm">
        Test Case Results
      </h3>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">Input</th>
            <th className="p-2 text-left">Expected</th>
            <th className="p-2 text-left">Actual</th>
            <th className="p-2 text-left">Pass</th>
            <th className="p-2 text-left">Error</th>
          </tr>
        </thead>

        <tbody>
          {results.map((item, index) => (
            <tr key={item.testCaseId ?? index} className="border-t">
              <td className="p-2">{index + 1}</td>

              <td className="p-2 align-top">
                <TruncatedText text={item.inputSnapshot} />
              </td>

              <td className="p-2 align-top">
                <TruncatedText
                  text={item.expectedOutputSnapshot}
                />
              </td>

              <td className="p-2 align-top">
                <TruncatedText text={item.actualOutput} />
              </td>

              <td className="p-2">
                {item.passed ? "PASS" : "FAIL"}
              </td>

              <td className="p-2 text-red-600">
                <TruncatedText text={item.stderr} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProblemSolver({
  problemId,
}: {
  problemId: string;
}) {
  const [code, setCode] = useState("");
  const [language, setLanguage] =
    useState("JAVASCRIPT");

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const [error, setError] = useState<string | null>(
    null
  );
  const [pollError, setPollError] = useState<
    string | null
  >(null);

  const [submissionId, setSubmissionId] = useState<
    string | null
  >(null);

  const [submission, setSubmission] =
    useState<Submission | null>(null);

  useEffect(() => {
    if (!submissionId) return;

    setPolling(true);
    setPollError(null);

    const interval = setInterval(async () => {
      try {
        const token = getToken();

        const res = await fetch(
          `/api/submissions/${submissionId}`,
          {
            headers: token
              ? {
                  authorization: `Bearer ${token}`,
                }
              : {},
          }
        );

        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login";
          return;
        }

        if (res.status === 404) {
          return;
        }

        if (!res.ok) {
          setPollError(
            "Failed to fetch submission status."
          );
          return;
        }

        const data = await res.json();
        const sub: Submission =
          data.submission ?? data;

        setSubmission(sub);

        if (TERMINAL_STATUSES.has(sub.status)) {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        setPollError("Polling failed.");
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [submissionId]);

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setPollError(null);

    setSubmission(null);
    setSubmissionId(null);

    try {
      const token = getToken();

      if (!token) {
        setError("You must be logged in.");
        return;
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          problemId,
          code,
          language,
        }),
      });

      const data = await res.json();

      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok || !data.submissionId) {
        throw new Error(
          data.error ?? "Submission failed"
        );
      }

      setSubmissionId(data.submissionId);
    } catch (err: any) {
      setError(
        err?.message ?? "Submission failed"
      );
    } finally {
      setLoading(false);
    }
  }

  const isBusy = loading || polling;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <div>
        <label className="block mb-1 text-sm font-medium">
          Language
        </label>

        <select
          value={language}
          onChange={(e) =>
            setLanguage(e.target.value)
          }
          className="border rounded p-2"
        >
          {LANGUAGES.map((lang) => (
            <option
              key={lang.value}
              value={lang.value}
            >
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <CodeEditor
        value={code}
        onChange={setCode}
        language={language}
      />

      <button
        type="submit"
        disabled={isBusy || !code.trim()}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
      >
        {loading
          ? "Submitting..."
          : polling
          ? "Waiting for result..."
          : "Submit"}
      </button>

      {error && (
        <div className="text-sm text-red-600">
          {error}
        </div>
      )}

      {submissionId && (
        <div className="text-sm text-green-700">
          Submission ID:{" "}
          <span className="font-mono">
            {submissionId}
          </span>
        </div>
      )}

      {pollError && (
        <div className="text-sm text-red-600">
          {pollError}
        </div>
      )}

      {submission && (
        <div className="mt-4">
          <SubmissionStatus
            status={submission.status}
            verdict={submission.verdict}
          />

          {submission.errorCode && (
            <div className="mt-2 text-sm text-red-700">
              {submission.errorCode}
              {submission.errorMessage
                ? ` - ${submission.errorMessage}`
                : ""}
            </div>
          )}

          <SubmissionResults
            submission={submission}
          />
        </div>
      )}
    </form>
  );
}