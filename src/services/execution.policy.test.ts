import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXECUTION_POLICY,
  ExecutionServiceError,
  MAX_EXECUTION_CODE_LENGTH,
  MAX_EXECUTION_INPUT_LENGTH,
  SUPPORTED_EXECUTION_LANGUAGES,
  isExecutionLanguage,
  normalizeExecutionPolicy,
  validateExecutionRequest,
} from "./execution.service";

describe("execution.service - policy normalization and validation", () => {
  it("provides correct default execution policy values", () => {
    assert.equal(DEFAULT_EXECUTION_POLICY.perTestTimeoutMs, 8000);
    assert.equal(DEFAULT_EXECUTION_POLICY.globalTimeoutMs, 120000);
    assert.equal(DEFAULT_EXECUTION_POLICY.limits.memoryMb, 256);
    assert.equal(DEFAULT_EXECUTION_POLICY.limits.cpuCount, 0.5);
    assert.equal(DEFAULT_EXECUTION_POLICY.limits.pids, 64);
    assert.equal(DEFAULT_EXECUTION_POLICY.disableNetwork, true);
    assert.equal(DEFAULT_EXECUTION_POLICY.readOnlyRootFs, true);
    assert.equal(DEFAULT_EXECUTION_POLICY.runAsNonRoot, true);
  });

  it("normalizes policy with default values when no overrides are given", () => {
    const policy = normalizeExecutionPolicy();
    assert.deepEqual(policy, DEFAULT_EXECUTION_POLICY);
  });

  it("correctly merges partial policy overrides", () => {
    const policy = normalizeExecutionPolicy({
      perTestTimeoutMs: 10000,
      limits: {
        memoryMb: 512,
      },
      disableNetwork: false,
    });

    assert.equal(policy.perTestTimeoutMs, 10000);
    assert.equal(policy.globalTimeoutMs, 120000);
    assert.equal(policy.limits.memoryMb, 512);
    assert.equal(policy.limits.cpuCount, 0.5);
    assert.equal(policy.limits.pids, 64);
    assert.equal(policy.disableNetwork, false);
  });

  it("throws INVALID_REQUEST when globalTimeoutMs is less than perTestTimeoutMs", () => {
    assert.throws(
      () => {
        normalizeExecutionPolicy({
          perTestTimeoutMs: 10000,
          globalTimeoutMs: 5000,
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionServiceError);
        assert.equal(err.code, "INVALID_REQUEST");
        assert.equal(
          err.message,
          "globalTimeoutMs must be greater than or equal to perTestTimeoutMs"
        );
        return true;
      }
    );
  });

  it("throws INVALID_REQUEST for invalid numeric limits", () => {
    assert.throws(
      () => normalizeExecutionPolicy({ limits: { memoryMb: -100 } }),
      (err: unknown) => err instanceof ExecutionServiceError && err.code === "INVALID_REQUEST"
    );

    assert.throws(
      () => normalizeExecutionPolicy({ limits: { cpuCount: 0 } }),
      (err: unknown) => err instanceof ExecutionServiceError && err.code === "INVALID_REQUEST"
    );

    assert.throws(
      () => normalizeExecutionPolicy({ limits: { pids: 1.5 } }),
      (err: unknown) => err instanceof ExecutionServiceError && err.code === "INVALID_REQUEST"
    );
  });

  it("validates supported languages correctly", () => {
    for (const lang of SUPPORTED_EXECUTION_LANGUAGES) {
      assert.equal(isExecutionLanguage(lang), true);
    }
    assert.equal(isExecutionLanguage("RUST"), false);
    assert.equal(isExecutionLanguage("RUBY"), false);
  });

  it("throws UNSUPPORTED_LANGUAGE for unsupported execution requests", () => {
    assert.throws(
      () => {
        validateExecutionRequest({
          language: "RUST" as unknown as "JAVASCRIPT",
          code: "fn main() {}",
          input: "",
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionServiceError);
        assert.equal(err.code, "UNSUPPORTED_LANGUAGE");
        return true;
      }
    );
  });

  it("throws INVALID_REQUEST for empty or whitespace-only code", () => {
    assert.throws(
      () => {
        validateExecutionRequest({
          language: "JAVASCRIPT",
          code: "   ",
          input: "",
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionServiceError);
        assert.equal(err.code, "INVALID_REQUEST");
        assert.equal(err.message, "Code is required");
        return true;
      }
    );
  });

  it("throws INVALID_REQUEST when code exceeds max length", () => {
    const hugeCode = "a".repeat(MAX_EXECUTION_CODE_LENGTH + 1);
    assert.throws(
      () => {
        validateExecutionRequest({
          language: "PYTHON",
          code: hugeCode,
          input: "",
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionServiceError);
        assert.equal(err.code, "INVALID_REQUEST");
        assert(err.message.includes("Code exceeds max length"));
        return true;
      }
    );
  });

  it("throws INVALID_REQUEST when input exceeds max length", () => {
    const hugeInput = "a".repeat(MAX_EXECUTION_INPUT_LENGTH + 1);
    assert.throws(
      () => {
        validateExecutionRequest({
          language: "PYTHON",
          code: "print('hello')",
          input: hugeInput,
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionServiceError);
        assert.equal(err.code, "INVALID_REQUEST");
        assert(err.message.includes("Input exceeds max length"));
        return true;
      }
    );
  });

  it("successfully validates a well-formed execution request", () => {
    const policy = validateExecutionRequest({
      language: "CPP",
      code: "int main() { return 0; }",
      input: "123",
      policy: {
        perTestTimeoutMs: 5000,
        globalTimeoutMs: 30000,
      },
    });

    assert.equal(policy.perTestTimeoutMs, 5000);
    assert.equal(policy.globalTimeoutMs, 30000);
    assert.equal(policy.limits.memoryMb, 256);
    assert.equal(policy.disableNetwork, true);
  });
});
