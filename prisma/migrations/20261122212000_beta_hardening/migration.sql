-- Add account-wide session revocation and single-use beta invitations.
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_codeHash_key" ON "Invitation"("codeHash");
CREATE UNIQUE INDEX "Invitation_redeemedById_key" ON "Invitation"("redeemedById");
CREATE INDEX "Invitation_expiresAt_redeemedAt_idx" ON "Invitation"("expiresAt", "redeemedAt");

ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_redeemedById_fkey"
FOREIGN KEY ("redeemedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
