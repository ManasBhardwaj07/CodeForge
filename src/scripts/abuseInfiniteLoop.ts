import { executeInSandbox } from "@/services/execution.service";

async function assertTimeout(label: string, outcome: Awaited<ReturnType<typeof executeInSandbox>>) {
  if (!outcome.timedOut || outcome.errorType !== "TIMEOUT") {
    throw new Error(`${label}: expected TIMEOUT, got timedOut=${outcome.timedOut} errorType=${outcome.errorType}`);
  }
}

async function main() {
  const js = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "while(true){}",
    input: "",
    policy: { perTestTimeoutMs: 1200, globalTimeoutMs: 1200 },
  });
  await assertTimeout("JS infinite loop", js);

  const py = await executeInSandbox({
    language: "PYTHON",
    code: "while True:\n  pass\n",
    input: "",
    policy: { perTestTimeoutMs: 1200, globalTimeoutMs: 1200 },
  });
  await assertTimeout("PY infinite loop", py);

  console.log("OK: abuse infinite loop passed.");
}

main().catch((err) => {
  console.error("abuseInfiniteLoop failed:", err);
  process.exitCode = 1;
});