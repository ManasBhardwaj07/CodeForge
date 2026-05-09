-- CreateTable
CREATE TABLE "RunExecution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "ProgrammingLanguage" NOT NULL,
    "code" TEXT NOT NULL,
    "customInput" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "actualOutput" TEXT,
    "stderr" TEXT,
    "exitCode" INTEGER,
    "executionTimeMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunExecution_userId_createdAt_idx" ON "RunExecution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RunExecution_status_createdAt_idx" ON "RunExecution"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "RunExecution" ADD CONSTRAINT "RunExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
