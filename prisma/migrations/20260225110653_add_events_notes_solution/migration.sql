-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "solutionCode" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "InterviewEvent" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'edit',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewNote" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewNote" ADD CONSTRAINT "InterviewNote_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
