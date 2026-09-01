import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SubmissionVerdict } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";
import { evaluateSubmission } from "./evaluation.service";

describe("evaluation.service - evaluateSubmission", () => {
  const originalFindMany = prisma.executionResult.findMany;

  function mockExecutionResults(
    results: Array<{ passed: boolean; stderr: string | null }>
  ) {
    (prisma.executionResult.findMany as unknown) = async () => results;
  }

  it("returns ACCEPTED when all test cases pass", async () => {
    mockExecutionResults([
      { passed: true, stderr: null },
      { passed: true, stderr: null },
      { passed: true, stderr: null },
    ]);

    const evaluation = await evaluateSubmission("sub-1");

    assert.equal(evaluation.verdict, SubmissionVerdict.ACCEPTED);
    assert.equal(evaluation.totalTests, 3);
    assert.equal(evaluation.passedTests, 3);
    assert.equal(evaluation.failedTests, 0);
  });

  it("returns WRONG_ANSWER when a test fails with standard output mismatch", async () => {
    mockExecutionResults([
      { passed: true, stderr: null },
      { passed: false, stderr: null },
    ]);

    const evaluation = await evaluateSubmission("sub-2");

    assert.equal(evaluation.verdict, SubmissionVerdict.WRONG_ANSWER);
    assert.equal(evaluation.totalTests, 2);
    assert.equal(evaluation.passedTests, 1);
    assert.equal(evaluation.failedTests, 1);
  });

  it("returns COMPILE_ERROR when any test case reports compilation failure", async () => {
    mockExecutionResults([
      { passed: false, stderr: "[COMPILE_ERROR] error: expected ';' before '}' token" },
      { passed: false, stderr: "[COMPILE_ERROR] error: expected ';' before '}' token" },
    ]);

    const evaluation = await evaluateSubmission("sub-3");

    assert.equal(evaluation.verdict, SubmissionVerdict.COMPILE_ERROR);
    assert.equal(evaluation.failedTests, 2);
    assert.equal(evaluation.passedTests, 0);
  });

  it("returns TIMEOUT when a test case reports execution timeout", async () => {
    mockExecutionResults([
      { passed: true, stderr: null },
      { passed: false, stderr: "[TIMEOUT] Global submission timeout exceeded" },
    ]);

    const evaluation = await evaluateSubmission("sub-4");

    assert.equal(evaluation.verdict, SubmissionVerdict.TIMEOUT);
    assert.equal(evaluation.totalTests, 2);
    assert.equal(evaluation.passedTests, 1);
    assert.equal(evaluation.failedTests, 1);
  });

  it("returns RUNTIME_ERROR when a test case crashes at runtime", async () => {
    mockExecutionResults([
      { passed: true, stderr: null },
      { passed: false, stderr: "[RUNTIME_ERROR] Segmentation fault (core dumped)" },
    ]);

    const evaluation = await evaluateSubmission("sub-5");

    assert.equal(evaluation.verdict, SubmissionVerdict.RUNTIME_ERROR);
    assert.equal(evaluation.totalTests, 2);
    assert.equal(evaluation.passedTests, 1);
    assert.equal(evaluation.failedTests, 1);
  });

  it("prioritizes COMPILE_ERROR over TIMEOUT, RUNTIME_ERROR, and WRONG_ANSWER", async () => {
    mockExecutionResults([
      { passed: false, stderr: "[WRONG_ANSWER]" },
      { passed: false, stderr: "[RUNTIME_ERROR] exit 1" },
      { passed: false, stderr: "[TIMEOUT] timeout" },
      { passed: false, stderr: "[COMPILE_ERROR] compile failed" },
    ]);

    const evaluation = await evaluateSubmission("sub-6");

    assert.equal(evaluation.verdict, SubmissionVerdict.COMPILE_ERROR);
  });

  it("prioritizes TIMEOUT over RUNTIME_ERROR and WRONG_ANSWER", async () => {
    mockExecutionResults([
      { passed: false, stderr: null },
      { passed: false, stderr: "[RUNTIME_ERROR] stack overflow" },
      { passed: false, stderr: "[TIMEOUT] timeout" },
    ]);

    const evaluation = await evaluateSubmission("sub-7");

    assert.equal(evaluation.verdict, SubmissionVerdict.TIMEOUT);
  });

  it("prioritizes RUNTIME_ERROR over WRONG_ANSWER", async () => {
    mockExecutionResults([
      { passed: false, stderr: null },
      { passed: false, stderr: "[RUNTIME_ERROR] ZeroDivisionError" },
      { passed: true, stderr: null },
    ]);

    const evaluation = await evaluateSubmission("sub-8");

    assert.equal(evaluation.verdict, SubmissionVerdict.RUNTIME_ERROR);
  });

  it("throws an error when a submission has no execution results", async () => {
    mockExecutionResults([]);

    await assert.rejects(
      async () => {
        await evaluateSubmission("sub-empty");
      },
      {
        name: "Error",
        message: "Submission sub-empty has no execution results to evaluate",
      }
    );
  });

  // Restore prisma mock
  it("cleans up mocks", () => {
    (prisma.executionResult.findMany as unknown) = originalFindMany;
  });
});
