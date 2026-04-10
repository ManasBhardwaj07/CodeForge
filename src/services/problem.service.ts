import { prisma } from "@/lib/prisma";

export async function listProblems() {
  return prisma.problem.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      difficulty: true,
      createdAt: true,
      testCases: {
        select: {
          id: true,
          input: true,
          expectedOutput: true,
          isSample: true,
          orderIndex: true,
        },
        orderBy: {
          orderIndex: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}
