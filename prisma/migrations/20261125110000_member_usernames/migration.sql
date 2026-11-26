ALTER TABLE "User" ADD COLUMN "username" VARCHAR(30);

UPDATE "User" SET "username" = CASE
  WHEN "email" IN (
    'amara@example.test', 'daniel@example.test', 'moderator@example.test',
    'nnenna@example.test', 'lucas@example.test'
  ) THEN 'demo_' || split_part("email", '@', 1)
  ELSE 'member_' || left(md5("id"), 23)
END;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_username_format_check"
  CHECK ("username" ~ '^[a-z0-9][a-z0-9_]{2,29}$');
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
