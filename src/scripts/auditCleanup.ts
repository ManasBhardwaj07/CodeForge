import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EXECUTION_CONTAINER_PREFIXES = [
  "codeforge-js-",
  "codeforge-py-",
  "codeforge-cpp-",
  "codeforge-c-",
  "codeforge-java-",
];

function isExecutionArtifact(name: string): boolean {
  return EXECUTION_CONTAINER_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function listExecutionContainers(): string[] {
  const res = spawnSync(
    "docker",
    ["ps", "-a", "--format", "{{.ID}} {{.Names}} {{.Status}}"],
    { encoding: "utf8", timeout: 10_000 },
  );

  if (res.status !== 0) {
    throw new Error(`docker ps failed: ${res.stderr || res.stdout || "unknown"}`);
  }

  const lines = (res.stdout ?? "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.filter((line) => {
    const parts = line.split(/\s+/);
    const name = parts[1] ?? "";
    return isExecutionArtifact(name);
  });
}

async function listExecutionTempDirs(): Promise<string[]> {
  const base = tmpdir();
  const entries = await readdir(base, { withFileTypes: true });

  const dirs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!isExecutionArtifact(e.name)) continue;

    const full = path.join(base, e.name);
    const st = await stat(full).catch(() => null);
    const ageSec = st ? Math.round((Date.now() - st.mtimeMs) / 1000) : -1;
    dirs.push(`${full} (ageSec=${ageSec})`);
  }
  return dirs;
}

async function main() {
  const containers = listExecutionContainers();
  const tempDirs = await listExecutionTempDirs();

  if (containers.length === 0 && tempDirs.length === 0) {
    console.log("OK: cleanup audit passed (no execution containers or temp dirs).");
    return;
  }

  console.error("CLEANUP AUDIT FAILED");

  if (containers.length > 0) {
    console.error("Leftover Docker execution containers:");
    for (const line of containers) console.error(`- ${line}`);
  }

  if (tempDirs.length > 0) {
    console.error("Leftover temp execution directories:");
    for (const line of tempDirs) console.error(`- ${line}`);
  }

  process.exitCode = 1;
}

main().catch((err) => {
  console.error("auditCleanup failed:", err);
  process.exitCode = 1;
});