import { executeInSandbox } from "@/services/execution.service";

async function main() {
  const js = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "console.log('hello-js')",
    input: "",
  });

  if (!js.stdout.includes("hello-js")) {
    throw new Error(
      `JS sandbox smoke failed: stdout=${JSON.stringify(js.stdout)} stderr=${JSON.stringify(js.stderr)}`,
    );
  }

  const py = await executeInSandbox({
    language: "PYTHON",
    code: "print('hello-py')",
    input: "",
  });

  if (!py.stdout.includes("hello-py")) {
    throw new Error(
      `PY sandbox smoke failed: stdout=${JSON.stringify(py.stdout)} stderr=${JSON.stringify(py.stderr)}`,
    );
  }

  console.log("OK: sandbox smoke passed (JS + Python).", {
    js: { success: js.success, timedOut: js.timedOut, errorType: js.errorType },
    py: { success: py.success, timedOut: py.timedOut, errorType: py.errorType },
  });
}

main().catch((err) => {
  console.error("smokeSandbox failed:", err);
  process.exitCode = 1;
});
