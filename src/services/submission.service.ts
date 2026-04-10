import { ProgrammingLanguage, SubmissionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { submissionQueue } from "@/lib/queue";

const allowedLanguages = new Set<ProgrammingLanguage>([
  ProgrammingLanguage.CPP,
  ProgrammingLanguage.JAVASCRIPT,
]);
const MAX_CODE_LENGTH = 20000;

export class SubmissionServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "SubmissionServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type CreateSubmissionInput = {
  userId: string;
  problemId: string;
  code: string;
  language: string;
};

function normalizeLanguage(language: string): ProgrammingLanguage {
  const normalized = language.trim().toUpperCase();

  if (normalized === ProgrammingLanguage.CPP) {
    return ProgrammingLanguage.CPP;
  }

  if (normalized === ProgrammingLanguage.JAVASCRIPT || normalized === "JS") {
    return ProgrammingLanguage.JAVASCRIPT;
  }

  throw new SubmissionServiceError("Unsupported language", 400, "UNSUPPORTED_LANGUAGE");
}

export async function createQueuedSubmission(input: CreateSubmissionInput) {
  if (
    !input ||
    typeof input.problemId !== "string" ||
    typeof input.code !== "string" ||
    typeof input.language !== "string"
  ) {
    throw new SubmissionServiceError("problemId, code and language are required", 400, "INVALID_SUBMISSION_INPUT");
  }

  if (!input.problemId || input.problemId.trim().length === 0) {
    throw new SubmissionServiceError("problemId is required", 400, "MISSING_PROBLEM_ID");
  }

  if (!input.code || input.code.trim().length === 0) {
    throw new SubmissionServiceError("Code is required", 400, "MISSING_CODE");
  }

  if (input.code.length > MAX_CODE_LENGTH) {
    throw new SubmissionServiceError("Code exceeds size limit", 413, "CODE_TOO_LARGE");
  }

  const parsedLanguage = normalizeLanguage(input.language);

  if (!allowedLanguages.has(parsedLanguage)) {
    throw new SubmissionServiceError("Unsupported language", 400, "UNSUPPORTED_LANGUAGE");
  }

  const problem = await prisma.problem.findUnique({
    where: {
      id: input.problemId,
    },
    select: {
      id: true,
    },
  });

  if (!problem) {
    throw new SubmissionServiceError("Problem not found", 404, "PROBLEM_NOT_FOUND");
  }

  const submission = await prisma.submission.create({
    data: {
      userId: input.userId,
      problemId: input.problemId,
      code: input.code,
      language: parsedLanguage,
      status: SubmissionStatus.QUEUED,
      startedAt: null,
      completedAt: null,
      failedAt: null,
    },
    select: {
      id: true,
      userId: true,
      problemId: true,
      language: true,
      status: true,
      createdAt: true,
    },
  });

  try {
    const job = await submissionQueue.add("execute", {
      submissionId: submission.id,
    }, {
      jobId: `submission-${submission.id}`,
    });

    return {
      ...submission,
      queueJobId: job.id,
    };
  } catch {
    await prisma.submission.update({
      where: {
        id: submission.id,
      },
      data: {
        status: SubmissionStatus.FAILED,
        failedAt: new Date(),
      },
    });

    throw new SubmissionServiceError(
      "Submission queue is unavailable",
      503,
      "QUEUE_UNAVAILABLE",
    );
  }
}
