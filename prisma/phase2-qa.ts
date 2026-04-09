import { SubmissionStatus } from "../generated/prisma";
import { disconnectPrisma, prisma } from "./client";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

function printResult(result: CheckResult) {
  const state = result.pass ? "PASS" : "FAIL";
  console.log(`[${state}] ${result.name} - ${result.details}`);
}

async function checkSeedData(): Promise<CheckResult> {
  const problems = await prisma.problem.findMany({
    include: { testCases: true },
    orderBy: { createdAt: "asc" },
  });

  const testCaseCount = problems.reduce((count, problem) => count + problem.testCases.length, 0);
  const hasRequiredShape = problems.every((problem) => problem.testCases.length >= 2);

  return {
    name: "Seed data availability",
    pass: problems.length >= 2 && testCaseCount >= 5 && hasRequiredShape,
    details: `problems=${problems.length}, testCases=${testCaseCount}`,
  };
}

async function checkUserSubmissionsRelation(): Promise<CheckResult> {
  const user = await prisma.user.findFirst({
    include: {
      submissions: true,
    },
  });

  if (!user) {
    return {
      name: "User to submissions relation",
      pass: false,
      details: "no user found",
    };
  }

  return {
    name: "User to submissions relation",
    pass: Array.isArray(user.submissions),
    details: `user=${user.email}, submissions=${user.submissions.length}`,
  };
}

async function checkProblemTestCasesRelation(): Promise<CheckResult> {
  const problem = await prisma.problem.findFirst({
    include: {
      testCases: {
        orderBy: {
          orderIndex: "asc",
        },
      },
    },
  });

  if (!problem) {
    return {
      name: "Problem to test cases relation",
      pass: false,
      details: "no problem found",
    };
  }

  const ordered = problem.testCases.every((testCase, index) => testCase.orderIndex === index + 1);

  return {
    name: "Problem to test cases relation",
    pass: problem.testCases.length > 0 && ordered,
    details: `problem=${problem.slug}, testCases=${problem.testCases.length}`,
  };
}

async function checkSubmissionExecutionResultsRelation(): Promise<CheckResult> {
  const user = await prisma.user.findFirst();
  const problem = await prisma.problem.findFirst({
    include: {
      testCases: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!user || !problem || problem.testCases.length === 0) {
    return {
      name: "Submission to execution results relation",
      pass: false,
      details: "missing user/problem/testcases for relation proof",
    };
  }

  const submission = await prisma.submission.create({
    data: {
      userId: user.id,
      problemId: problem.id,
      language: "JAVASCRIPT",
      code: "console.log('ok')",
      status: SubmissionStatus.COMPLETED,
    },
  });

  const firstTestCase = problem.testCases[0];

  if (!firstTestCase) {
    return {
      name: "Submission to execution results relation",
      pass: false,
      details: "no test case found for submission proof",
    };
  }

  await prisma.executionResult.create({
    data: {
      submissionId: submission.id,
      testCaseId: firstTestCase.id,
      inputSnapshot: firstTestCase.input,
      expectedOutputSnapshot: firstTestCase.expectedOutput,
      actualOutput: firstTestCase.expectedOutput,
      passed: true,
      executionTimeMs: 10,
      exitCode: 0,
    },
  });

  const foundSubmission = await prisma.submission.findUnique({
    where: { id: submission.id },
    include: {
      executionResults: true,
    },
  });

  return {
    name: "Submission to execution results relation",
    pass:
      !!foundSubmission &&
      foundSubmission.executionResults.length === 1 &&
      foundSubmission.executionResults[0] !== undefined &&
      foundSubmission.executionResults[0].submissionId === submission.id,
    details: `submission=${submission.id}, results=${foundSubmission?.executionResults.length ?? 0}`,
  };
}

async function checkForeignKeyIntegrity(): Promise<CheckResult> {
  const fakeId = "phase2_fk_invalid_id";

  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "Submission" ("id", "userId", "problemId", "language", "code", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
      `sub_${Date.now()}`,
      fakeId,
      fakeId,
      "JAVASCRIPT",
      "console.log('x')",
      "QUEUED",
    );

    return {
      name: "Foreign key integrity",
      pass: false,
      details: "invalid submission insert unexpectedly succeeded",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const pass =
      message.includes("foreign key") ||
      message.includes("Foreign key") ||
      message.includes("violates foreign key constraint");

    return {
      name: "Foreign key integrity",
      pass,
      details: pass ? "invalid FK insert rejected by database" : message,
    };
  }
}

async function runQa() {
  const checks: CheckResult[] = [];

  checks.push(await checkSeedData());
  checks.push(await checkUserSubmissionsRelation());
  checks.push(await checkProblemTestCasesRelation());
  checks.push(await checkSubmissionExecutionResultsRelation());
  checks.push(await checkForeignKeyIntegrity());

  console.log("\nPhase 2 QA Summary");
  for (const check of checks) {
    printResult(check);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.error(`\nQA failed: ${failed.length} checks did not pass.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll Phase 2 QA checks passed.");
}

runQa()
  .catch((error) => {
    console.error("Phase 2 QA execution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
