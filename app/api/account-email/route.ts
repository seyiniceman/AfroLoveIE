import bcrypt from "bcryptjs";
import { after, NextRequest, NextResponse } from "next/server";
import { clearSession, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { emailDeliveryAvailable, emailTokenHash, sendAccountEmail } from "@/lib/account-email";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    return await handleAccountEmail(request);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code : undefined;
    console.error("Account email request failed.", { name, code });
    return jsonError("Account email is temporarily unavailable. Please try again.", 503);
  }
}

async function handleAccountEmail(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid request.");

  if (body.action === "resend") {
    const user = await getRequestUser(request, { allowUnverified: true });
    if (!user) return jsonError("Sign in to request another verification email.", 401);
    if (!emailDeliveryAvailable()) return jsonError("Email delivery is unavailable.", 503);
    if (!user.emailVerifiedAt) await sendAccountEmail(user, "VERIFY");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "request-reset") {
    if (!emailDeliveryAvailable()) return jsonError("Email delivery is unavailable.", 503);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      after(async () => {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, username: true },
        });
        if (user) await sendAccountEmail(user, "RESET");
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "verify" && body.action !== "reset") return jsonError("Unsupported account email action.");
  if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return jsonError("This link is invalid, expired, or already used.");
  }

  const purpose = body.action === "verify" ? "VERIFY" : "RESET";
  const password = typeof body.password === "string" ? body.password : "";
  if (purpose === "RESET" && (password.length < 12 || Buffer.byteLength(password, "utf8") > 72)) {
    return jsonError("Choose at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  const tokenHash = emailTokenHash(body.token);
  const token = await prisma.accountEmailToken.findUnique({ where: { tokenHash } });
  if (!token || token.purpose !== purpose || token.expiresAt <= new Date()) {
    return jsonError("This link is invalid, expired, or already used.");
  }
  if (purpose === "VERIFY") {
    const viewer = await getRequestUser(request, { allowUnverified: true });
    if (viewer?.id !== token.userId) {
      return jsonError("Sign in to the account you registered, then reopen the verification link in this browser.", 403);
    }
  }
  const passwordHash = purpose === "RESET" ? await bcrypt.hash(password, 12) : null;
  const now = new Date();
  const completed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.accountEmailToken.deleteMany({ where: { tokenHash, expiresAt: { gt: now } } });
    if (claimed.count !== 1) return false;
    if (passwordHash !== null) {
      await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
    }
    await tx.user.update({
      where: { id: token.userId },
      data: passwordHash !== null
        ? { passwordHash, sessionVersion: { increment: 1 } }
        : { emailVerifiedAt: now },
    });
    return true;
  });
  if (!completed) return jsonError("This link is invalid, expired, or already used.");
  const response = NextResponse.json({ ok: true });
  if (purpose === "RESET") clearSession(response);
  return response;
}
