import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getRuntimeConfig } from "../scripts/runtime-config.mjs";

export type EmailPurpose = "VERIFY" | "RESET";

export function emailDeliveryAvailable() {
  return getRuntimeConfig().appEnvironment === "development" && Boolean(process.env.MAILPIT_URL);
}

export function emailTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendAccountEmail(user: { id: string; email: string; username: string }, purpose: EmailPurpose) {
  if (!emailDeliveryAvailable()) return;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = emailTokenHash(token);
  const now = new Date();
  const cooldown = new Date(now.getTime() - 60_000);
  const lifetime = purpose === "VERIFY" ? 24 * 60 : 30;
  const expiresAt = new Date(now.getTime() + lifetime * 60_000);
  const claimed = await prisma.$executeRaw`
    INSERT INTO "AccountEmailToken" ("userId", "purpose", "tokenHash", "createdAt", "expiresAt")
    VALUES (${user.id}, ${purpose}, ${tokenHash}, ${now}, ${expiresAt})
    ON CONFLICT ("userId", "purpose") DO UPDATE SET
      "tokenHash" = EXCLUDED."tokenHash",
      "createdAt" = EXCLUDED."createdAt",
      "expiresAt" = EXCLUDED."expiresAt"
    WHERE "AccountEmailToken"."createdAt" <= ${cooldown}
  `;
  if (!claimed) return;

  try {
    const link = new URL("/account-email", process.env.APP_ORIGIN || process.env.ACCOUNT_EMAIL_ORIGIN || "http://localhost:3000");
    link.hash = new URLSearchParams({ action: purpose.toLowerCase(), token }).toString();
    const verify = purpose === "VERIFY";
    const response = await fetch(new URL("/api/v1/send", process.env.MAILPIT_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        From: { Email: "accounts@afroie.example", Name: "AfroIE Meet" },
        To: [{ Email: user.email }],
        Subject: verify ? "Verify your AfroIE Meet email" : "Reset your AfroIE Meet password",
        Text: [
          verify ? "Confirm your email to continue setting up your profile." : `Your AfroIE Meet username is: ${user.username}. If you only needed your username, you can sign in with your current password. Use this link to choose a new one.`,
          link.toString(),
          verify ? "This link expires in 24 hours." : "This link expires in 30 minutes. If you did not request a reset, you can ignore this email.",
        ].join("\n\n"),
      }),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  } catch {
    // Keep the cooldown even if the mail service is down.
    console.error("Account email delivery failed.");
  }
}
