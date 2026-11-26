ALTER TABLE "Message" ADD COLUMN "readAt" TIMESTAMP(3);
UPDATE "Message" SET "readAt" = "createdAt";
CREATE INDEX "Message_conversationId_readAt_idx" ON "Message"("conversationId", "readAt");

ALTER TABLE "Report" ADD COLUMN "evidenceKind" TEXT NOT NULL DEFAULT 'PROFILE',
ADD COLUMN "evidenceRef" TEXT,
ADD COLUMN "evidenceData" TEXT,
ADD COLUMN "outcome" TEXT;

CREATE TABLE "ReportReview" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "moderatorId" TEXT,
  "status" "ReportStatus" NOT NULL,
  "outcome" TEXT,
  "note" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportReview_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ReportReview_reportId_createdAt_idx" ON "ReportReview"("reportId", "createdAt");
CREATE UNIQUE INDEX "Report_open_evidence_unique" ON "Report"("reporterId", "evidenceKind", "evidenceRef")
WHERE "evidenceRef" IS NOT NULL AND "status" IN ('OPEN', 'REVIEWING');
