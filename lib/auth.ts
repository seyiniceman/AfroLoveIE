import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRuntimeConfig } from "../scripts/runtime-config.mjs";

const COOKIE_NAME = "afroie_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24;

function sessionKey() {
  return new TextEncoder().encode(getRuntimeConfig().sessionSecret);
}

export async function createSession(response: NextResponse, userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRuntimeConfig().appEnvironment !== "development",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getRuntimeConfig().appEnvironment !== "development",
    path: "/",
    maxAge: 0,
  });
}

async function userFromToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        dateOfBirth: true,
        sessionVersion: true,
        profile: true,
      },
    });
    if (!user || payload.sv !== user.sessionVersion) return null;
    const { sessionVersion: _sessionVersion, ...safeUser } = user;
    return safeUser;
  } catch (error) {
    if (error instanceof Error && error.name === "JWTExpired") return null;
    if (error instanceof Error && error.name === "JWSSignatureVerificationFailed") return null;
    throw error;
  }
}

export async function getRequestUser(request: NextRequest) {
  return userFromToken(request.cookies.get(COOKIE_NAME)?.value);
}

export async function getPageUser() {
  const cookieStore = await cookies();
  return userFromToken(cookieStore.get(COOKIE_NAME)?.value);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function sameOriginMutationError(request: NextRequest) {
  const config = getRuntimeConfig();
  const origin = request.headers.get("origin");
  if (!origin) {
    return config.appEnvironment === "development"
      ? null
      : jsonError("A browser origin is required for this request.", 403);
  }
  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    return jsonError("The request origin is invalid.", 403);
  }
  const expectedOrigin = config.appOrigin ??
    `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  return requestOrigin === expectedOrigin
    ? null
    : jsonError("Cross-origin requests are not allowed.", 403);
}

export async function blockedEitherWay(firstId: string, secondId: string, db = prisma) {
  const existing = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: firstId, blockedId: secondId },
        { blockerId: secondId, blockedId: firstId },
      ],
    },
    select: { id: true },
  });
  return Boolean(existing);
}
