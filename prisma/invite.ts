import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});

async function main() {
  const expirationDays = Number(process.argv[2] ?? "14");
  if (!Number.isInteger(expirationDays) || expirationDays < 1 || expirationDays > 365) {
    throw new Error("Invitation expiry must be a whole number from 1 to 365 days.");
  }

  const code = randomBytes(32).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  await prisma.invitation.create({ data: { codeHash, expiresAt } });
  console.log(`Invitation code (share once): ${code}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
}

main()
  .catch((error: unknown) => {
    console.error("Invitation creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
