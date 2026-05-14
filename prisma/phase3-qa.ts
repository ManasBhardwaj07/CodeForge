import { disconnectPrisma, prisma } from "./client";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { GET as problemsRoute } from "../src/app/api/problems/route";
import { GET as protectedRoute } from "../src/app/api/protected/route";
import { POST as submitRoute } from "../src/app/api/submit/route";
import { closeSubmissionQueue } from "../src/lib/queue";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

function printResult(result: CheckResult) {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name} - ${result.details}`);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

type ErrorBody = {
  error?: string;
  code?: string;
};

async function runPhase3Qa() {
  const checks: CheckResult[] = [];

  const uniqueSuffix = Date.now().toString();
  const email = `phase3_${uniqueSuffix}@codeforge.dev`;
  const username = `phase3_user_${uniqueSuffix}`;
  const password = "StrongPass123!";

  const registerResponse = await registerRoute(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    }),
  );

  const registerBody = (await parseJsonResponse(registerResponse)) as {
    token?: string;
    user?: {
      id: string;
      email: string;
      username: string;
      createdAt: string;
      passwordHash?: string;
    };
    error?: string;
  };

  checks.push({
    name: "Register returns success",
    pass: registerResponse.status === 201 && typeof registerBody.token === "string",
    details: `status=${registerResponse.status}`,
  });

  const registeredUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  const passwordWasHashed =
    !!registeredUser && registeredUser.passwordHash !== password && registeredUser.passwordHash.length > 20;

  checks.push({
    name: "Password security",
    pass: passwordWasHashed && !registerBody.user?.passwordHash,
    details: passwordWasHashed
      ? "stored password is hashed and never returned"
      : "password hashing check failed",
  });

  const duplicateRegisterResponse = await registerRoute(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, username: `${username}_dup`, password }),
    }),
  );

  const duplicateRegisterBody = (await parseJsonResponse(duplicateRegisterResponse)) as ErrorBody;

  checks.push({
    name: "Duplicate registration blocked",
    pass: duplicateRegisterResponse.status === 409 && duplicateRegisterBody.code === "USER_ALREADY_EXISTS",
    details: `status=${duplicateRegisterResponse.status}, code=${duplicateRegisterBody.code ?? "none"}`,
  });

  const loginResponse = await loginRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );

  const loginBody = (await parseJsonResponse(loginResponse)) as {
    token?: string;
  };

  checks.push({
    name: "Login returns JWT",
    pass: loginResponse.status === 200 && typeof loginBody.token === "string",
    details: `status=${loginResponse.status}`,
  });

  const wrongPasswordResponse = await loginRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "WrongPassword123" }),
    }),
  );

  const wrongPasswordBody = (await parseJsonResponse(wrongPasswordResponse)) as ErrorBody;

  checks.push({
    name: "Wrong password rejected",
    pass: wrongPasswordResponse.status === 401 && wrongPasswordBody.code === "INVALID_CREDENTIALS",
    details: `status=${wrongPasswordResponse.status}, code=${wrongPasswordBody.code ?? "none"}`,
  });

  const protectedWithoutToken = await protectedRoute(
    new Request("http://localhost/api/protected", {
      method: "GET",
    }),
  );

  const protectedWithoutTokenBody = (await parseJsonResponse(protectedWithoutToken)) as ErrorBody;

  checks.push({
    name: "Protected route blocks unauthenticated",
    pass: protectedWithoutToken.status === 401 && protectedWithoutTokenBody.code === "AUTH_HEADER_MISSING",
    details: `status=${protectedWithoutToken.status}, code=${protectedWithoutTokenBody.code ?? "none"}`,
  });

  const protectedWithToken = await protectedRoute(
    new Request("http://localhost/api/protected", {
      method: "GET",
      headers: {
        authorization: `Bearer ${loginBody.token ?? ""}`,
      },
    }),
  );

  checks.push({
    name: "Protected route allows authenticated",
    pass: protectedWithToken.status === 200,
    details: `status=${protectedWithToken.status}`,
  });

  const problemsResponse = await problemsRoute();
  const problemsBody = (await parseJsonResponse(problemsResponse)) as {
    problems?: Array<{ id: string }>;
  };

  const firstProblemId = problemsBody.problems?.[0]?.id;

  checks.push({
    name: "Problems API returns data",
    pass: problemsResponse.status === 200 && typeof firstProblemId === "string",
    details: `status=${problemsResponse.status}, count=${problemsBody.problems?.length ?? 0}`,
  });

  const submitWithoutToken = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        problemId: firstProblemId,
        code: "console.log('test')",
        language: "JAVASCRIPT",
      }),
    }),
  );

  const submitWithoutTokenBody = (await parseJsonResponse(submitWithoutToken)) as ErrorBody;

  checks.push({
    name: "Submission blocks unauthenticated requests",
    pass: submitWithoutToken.status === 401 && submitWithoutTokenBody.code === "AUTH_HEADER_MISSING",
    details: `status=${submitWithoutToken.status}, code=${submitWithoutTokenBody.code ?? "none"}`,
  });

  const submitInvalidLanguage = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token ?? ""}`,
      },
      body: JSON.stringify({
        problemId: firstProblemId,
        code: "print(1)",
        language: "RUBY",
      }),
    }),
  );

  const submitInvalidLanguageBody = (await parseJsonResponse(submitInvalidLanguage)) as ErrorBody;

  checks.push({
    name: "Submission rejects unsupported language",
    pass: submitInvalidLanguage.status === 400 && submitInvalidLanguageBody.code === "UNSUPPORTED_LANGUAGE",
    details: `status=${submitInvalidLanguage.status}, code=${submitInvalidLanguageBody.code ?? "none"}`,
  });

  const submitMissingProblem = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token ?? ""}`,
      },
      body: JSON.stringify({
        problemId: "non_existing_problem_id",
        code: "console.log('x')",
        language: "JAVASCRIPT",
      }),
    }),
  );

  const submitMissingProblemBody = (await parseJsonResponse(submitMissingProblem)) as ErrorBody;

  checks.push({
    name: "Submission rejects invalid problem",
    pass: submitMissingProblem.status === 404 && submitMissingProblemBody.code === "PROBLEM_NOT_FOUND",
    details: `status=${submitMissingProblem.status}, code=${submitMissingProblemBody.code ?? "none"}`,
  });

  const oversizedCode = "x".repeat(20001);
  const oversizedCodeResponse = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token ?? ""}`,
      },
      body: JSON.stringify({
        problemId: firstProblemId,
        code: oversizedCode,
        language: "JAVASCRIPT",
      }),
    }),
  );

  const oversizedCodeBody = (await parseJsonResponse(oversizedCodeResponse)) as ErrorBody;

  checks.push({
    name: "Submission enforces code size limit",
    pass: oversizedCodeResponse.status === 413 && oversizedCodeBody.code === "CODE_TOO_LARGE",
    details: `status=${oversizedCodeResponse.status}, code=${oversizedCodeBody.code ?? "none"}`,
  });

  const submitResponse = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token ?? ""}`,
      },
      body: JSON.stringify({
        problemId: firstProblemId,
        code: "console.log('phase3')",
        language: "JAVASCRIPT",
      }),
    }),
  );

  const submitBody = (await parseJsonResponse(submitResponse)) as {
    submission?: {
      id: string;
      status: string;
      userId: string;
    };
  };

  const createdSubmission = submitBody.submission?.id
    ? await prisma.submission.findUnique({
        where: {
          id: submitBody.submission.id,
        },
        select: {
          id: true,
          status: true,
          userId: true,
        },
      })
    : null;

  checks.push({
    name: "Submission flow creates QUEUED row",
    pass:
      submitResponse.status === 201 &&
      createdSubmission?.status === "QUEUED" &&
      createdSubmission.userId === registerBody.user?.id,
    details: `status=${submitResponse.status}, submissionStatus=${createdSubmission?.status ?? "none"}`,
  });

  console.log("\nPhase 3 QA Summary");
  for (const check of checks) {
    printResult(check);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.error(`\nPhase 3 QA failed: ${failed.length} checks failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll Phase 3 QA checks passed.");
}

runPhase3Qa()
  .catch((error) => {
    console.error("Phase 3 QA execution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSubmissionQueue();
    await disconnectPrisma();
  });
