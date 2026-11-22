import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, clearSession, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageOnDate } from "@/lib/validation";
import { getRuntimeConfig } from "../../../scripts/runtime-config.mjs";

const demoAccounts = new Set([
  "amara@example.test",
  "daniel@example.test",
  "moderator@example.test",
  "nnenna@example.test",
  "lucas@example.test",
]);

export async function GET(request: NextRequest) {
  const config = getRuntimeConfig();
  const user = await getRequestUser(request);
  return NextResponse.json({
    user,
    demoAvailable: config.appEnvironment === "development" && config.demoDataEnabled,
    inviteRequired: config.inviteOnly,
  });
}

export async function POST(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const config = getRuntimeConfig();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (body.action === "logout") {
    const user = await getRequestUser(request);
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
    }
    const response = NextResponse.json({ ok: true });
    clearSession(response);
    return response;
  }

  if (body.action === "demo") {
    if (config.appEnvironment !== "development" || !config.demoDataEnabled) {
      return jsonError("Demo sign-in is disabled.", 404);
    }
    const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
    if (!demoAccounts.has(email)) return jsonError("That local demo account is not available.", 404);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, sessionVersion: true } });
    if (!user) return jsonError("Demo data has not been loaded. Run npm run db:seed.", 404);
    const response = NextResponse.json({ ok: true });
    await createSession(response, user.id, user.sessionVersion);
    return response;
  }

  if (body.action === "login") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await prisma.user.findUnique({ where: { email } });
    if (Buffer.byteLength(password, "utf8") > 72 ||
        !user || !(await bcrypt.compare(password, user.passwordHash))) {
      return jsonError("Email or password is incorrect.", 401);
    }
    const response = NextResponse.json({ ok: true });
    await createSession(response, user.id, user.sessionVersion);
    return response;
  }

  if (body.action === "signup") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const dobValue = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return jsonError("Enter a valid email address.");
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      return jsonError("Choose a password with at least 12 characters and no more than 72 UTF-8 bytes.");
    }
    if (displayName.length < 2 || displayName.length > 40) {
      return jsonError("Your display name must be between 2 and 40 characters.");
    }
    if (body.ageConfirmed !== true) return jsonError("Please confirm that you are 18 or older.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobValue)) return jsonError("Enter your date of birth.");
    const dateOfBirth = new Date(`${dobValue}T00:00:00.000Z`);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== dobValue) {
      return jsonError("Enter a real date of birth.");
    }
    if (ageOnDate(dateOfBirth) < 18) return jsonError("You must be 18 or older to create an account.");
    const invitationCode = typeof body.invitationCode === "string" ? body.invitationCode.trim() : "";
    if (config.inviteOnly && !invitationCode) return jsonError("An invitation code is required.", 403);

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.$transaction(async (tx) => {
        let invitationId: string | undefined;
        if (config.inviteOnly) {
          const codeHash = createHash("sha256").update(invitationCode).digest("hex");
          const invitation = await tx.invitation.findUnique({ where: { codeHash } });
          if (!invitation || invitation.redeemedAt || (invitation.expiresAt && invitation.expiresAt <= new Date())) {
            throw new Error("INVITATION_UNAVAILABLE");
          }
          invitationId = invitation.id;
        }

        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            dateOfBirth,
            profile: { create: { displayName, city: "Dublin" } },
          },
          select: { id: true, sessionVersion: true },
        });
        if (invitationId) {
          const redemption = await tx.invitation.updateMany({
            where: {
              id: invitationId,
              redeemedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            data: { redeemedAt: new Date(), redeemedById: created.id },
          });
          if (redemption.count !== 1) throw new Error("INVITATION_UNAVAILABLE");
        }
        return created;
      });
      const response = NextResponse.json({ ok: true }, { status: 201 });
      await createSession(response, user.id, user.sessionVersion);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message === "INVITATION_UNAVAILABLE") {
        return jsonError("This invitation code is invalid, expired, or already used.", 403);
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return jsonError("An account with this email already exists.", 409);
      }
      throw error;
    }
  }

  return jsonError("Choose a supported authentication action.");
}
