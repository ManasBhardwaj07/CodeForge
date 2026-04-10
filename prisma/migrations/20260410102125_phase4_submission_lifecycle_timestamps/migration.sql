-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);
