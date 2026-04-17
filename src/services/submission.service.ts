import { prisma } from "@/lib/prisma";
import { getSubmissionQueue } from "@/lib/queue";
import { $Enums } from "@/generated/prisma";

export class SubmissionServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
  }
}

type CreateQueuedSubmissionInput = {
  userId: string;
  problemId: string;
  code: string;
  language: string;
};

export async function createQueuedSubmission(
  input: CreateQueuedSubmissionInput
) {
  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    select: { id: true },
  });

  if (!problem) {
    throw new SubmissionServiceError(
      "Problem not found",
      "PROBLEM_NOT_FOUND",
      404
    );
  }

  const submission = await prisma.submission.create({
    data: {
      userId: input.userId,
      problemId: input.problemId,
      code: input.code,
      language: input.language as $Enums.ProgrammingLanguage,
      status: "QUEUED",
    },
  });
  console.log("DB SUBMISSION ID:", submission.id);

  const job = await getSubmissionQueue().add(
    "process-submission",
    { submissionId: submission.id },
    { jobId: `submission-${submission.id}` }
  );
  console.log("QUEUE JOB ID:", job.id);

  return submission;
}

export async function getSubmissionById(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    include: {
      executionResults: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function listSubmissionsForUser(userId: string) {
  return prisma.submission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      verdict: true,
      createdAt: true,
      problem: {
        select: { title: true },
      },
    },
  });
}