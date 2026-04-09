import { ProblemDifficulty } from "../generated/prisma";
import { disconnectPrisma, prisma } from "./client";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@codeforge.dev" },
    update: {
      username: "demo_user",
      passwordHash: "demo_hash_phase2",
    },
    create: {
      email: "demo@codeforge.dev",
      username: "demo_user",
      passwordHash: "demo_hash_phase2",
    },
  });

  const twoSumProblem = await prisma.problem.upsert({
    where: { slug: "two-sum-variant" },
    update: {
      title: "Two Sum Variant",
      description:
        "Given two integers separated by a space, print their sum. Return only the sum.",
      difficulty: ProblemDifficulty.EASY,
    },
    create: {
      title: "Two Sum Variant",
      slug: "two-sum-variant",
      description:
        "Given two integers separated by a space, print their sum. Return only the sum.",
      difficulty: ProblemDifficulty.EASY,
    },
  });

  const maxOfThreeProblem = await prisma.problem.upsert({
    where: { slug: "max-of-three" },
    update: {
      title: "Max Of Three",
      description:
        "Given three integers separated by spaces, print the largest integer.",
      difficulty: ProblemDifficulty.MEDIUM,
    },
    create: {
      title: "Max Of Three",
      slug: "max-of-three",
      description:
        "Given three integers separated by spaces, print the largest integer.",
      difficulty: ProblemDifficulty.MEDIUM,
    },
  });

  const testCaseInputs = [
    {
      problemId: twoSumProblem.id,
      cases: [
        { orderIndex: 1, input: "1 2", expectedOutput: "3", isSample: true },
        { orderIndex: 2, input: "10 -4", expectedOutput: "6", isSample: true },
        { orderIndex: 3, input: "100 200", expectedOutput: "300", isSample: false },
      ],
    },
    {
      problemId: maxOfThreeProblem.id,
      cases: [
        { orderIndex: 1, input: "1 2 3", expectedOutput: "3", isSample: true },
        { orderIndex: 2, input: "9 7 8", expectedOutput: "9", isSample: true },
        { orderIndex: 3, input: "-2 -9 -1", expectedOutput: "-1", isSample: false },
      ],
    },
  ];

  for (const entry of testCaseInputs) {
    for (const currentCase of entry.cases) {
      await prisma.testCase.upsert({
        where: {
          problemId_orderIndex: {
            problemId: entry.problemId,
            orderIndex: currentCase.orderIndex,
          },
        },
        update: {
          input: currentCase.input,
          expectedOutput: currentCase.expectedOutput,
          isSample: currentCase.isSample,
        },
        create: {
          problemId: entry.problemId,
          orderIndex: currentCase.orderIndex,
          input: currentCase.input,
          expectedOutput: currentCase.expectedOutput,
          isSample: currentCase.isSample,
        },
      });
    }
  }

  const problemCount = await prisma.problem.count();
  const testCaseCount = await prisma.testCase.count();

  console.log("Seed completed", {
    userId: user.id,
    problemCount,
    testCaseCount,
  });
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
