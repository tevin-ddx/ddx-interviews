-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'python';

-- CreateTable
CREATE TABLE "QuestionFile" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "QuestionFile" ADD CONSTRAINT "QuestionFile_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
