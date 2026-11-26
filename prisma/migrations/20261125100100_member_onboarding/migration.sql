ALTER TABLE "Profile"
ADD COLUMN "relationshipIntents" "RelationshipIntent"[] NOT NULL DEFAULT ARRAY[]::"RelationshipIntent"[],
ADD COLUMN "sex" TEXT,
ADD COLUMN "gender" TEXT,
ADD COLUMN "showGender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ethnicity" TEXT,
ADD COLUMN "showEthnicity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "occupation" TEXT,
ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "lookingFor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "saturdayPrompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "meetupPrompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discoveryPaused" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Profile" SET "relationshipIntents" = ARRAY["relationshipIntent"];
