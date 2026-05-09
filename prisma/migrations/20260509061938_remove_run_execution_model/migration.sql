/*
  Warnings:

  - You are about to drop the `RunExecution` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RunExecution" DROP CONSTRAINT "RunExecution_userId_fkey";

-- DropTable
DROP TABLE "RunExecution";
