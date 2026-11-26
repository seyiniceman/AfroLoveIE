import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;

async function main() {
  const expirationDays = Number(process.argv[2] ?? "14");
  if (!Number.isInteger(expirationDays) || expirationDays < 1 || expirationDays > 365) {
    throw new Error("Invitation expiry must be a whole number from 1 to 365 days.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const code = randomBytes(32).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO "Invitation" ("id", "codeHash", "expiresAt") VALUES ($1, $2, $3)',
      [randomUUID(), codeHash, expiresAt],
    );
  } finally {
    await client.end();
  }

  console.log(`Invitation code (share once): ${code}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
}

main().catch((error) => {
  console.error("Invitation creation failed:", error);
  process.exitCode = 1;
});
