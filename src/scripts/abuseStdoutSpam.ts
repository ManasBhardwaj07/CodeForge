import { executeInSandbox } from "@/services/execution.service";

function assertTruncated(label: string, outcome: Awaited<ReturnType<typeof executeInSandbox>>) {
  if (!outcome.metadata.outputTruncated) {
    throw new Error(`${label}: expected outputTruncated=true`);
  }
  if (!outcome.stderr.includes("Output truncated")) {
    throw new Error(`${label}: expected stderr to include truncation note`);
  }
  if (outcome.stdout.length > 64_000) {
    throw new Error(`${label}: stdout exceeded cap: len=${outcome.stdout.length}`);
  }
}

async function main() {
  const js = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "while(true) console.log('x'.repeat(1000));",
    input: "",
    policy: { perTestTimeoutMs: 2000, globalTimeoutMs: 2000 },
  });
  assertTruncated("JS stdout spam", js);

  const py = await executeInSandbox({
    language: "PYTHON",
    code: "while True:\n  print('x'*1000)\n",
    input: "",
    policy: { perTestTimeoutMs: 2000, globalTimeoutMs: 2000 },
  });
  assertTruncated("PY stdout spam", py);

  console.log("OK: abuse stdout spam passed.");
}

main().catch((err) => {
  console.error("abuseStdoutSpam failed:", err);
  process.exitCode = 1;
});