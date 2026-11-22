import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { clearSession, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to delete your account.", 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
    return jsonError("Your password is required to delete this account.", 403);
  }
  await prisma.user.delete({ where: { id: user.id } });
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
