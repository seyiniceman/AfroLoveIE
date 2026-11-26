ALTER TYPE "RelationshipIntent" ADD VALUE 'NETWORKING';
ALTER TABLE "Profile" ADD COLUMN "county" TEXT;

CREATE TABLE "CommunityEvent" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "county" VARCHAR(30) NOT NULL,
  "venue" VARCHAR(120) NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "url" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityEvent_startsAt_idx" ON "CommunityEvent"("startsAt");
