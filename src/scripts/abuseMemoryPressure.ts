import { executeInSandbox } from "@/services/execution.service";

function assertNotSuccess(label: string, outcome: Awaited<ReturnType<typeof executeInSandbox>>) {
  if (outcome.success) {
    throw new Error(`${label}: expected failure, got success=true`);
  }
}

async function main() {
  const js = await executeInSandbox({
    language: "JAVASCRIPT",
    code: `
const a = [];
while (true) {
  a.push("x".repeat(5_000_000));
}
`.trim(),
    input: "",
    policy: { perTestTimeoutMs: 2500, globalTimeoutMs: 2500 },
  });
  assertNotSuccess("JS memory pressure", js);

  const py = await executeInSandbox({
    language: "PYTHON",
    code: `
a = []
while True:
  a.append("x" * 5_000_000)
`.trim(),
    input: "",
    policy: { perTestTimeoutMs: 2500, globalTimeoutMs: 2500 },
  });
  assertNotSuccess("PY memory pressure", py);

  console.log("OK: abuse memory pressure passed.");
}

main().catch((err) => {
  console.error("abuseMemoryPressure failed:", err);
  process.exitCode = 1;
});