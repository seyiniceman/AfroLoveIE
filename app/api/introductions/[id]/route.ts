import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to respond to introductions.", 401);
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const action = body.action;
  if (action !== "accept" && action !== "decline") return jsonError("Choose accept or decline.");
  const introduction = await prisma.introduction.findUnique({ where: { id } });
  if (!introduction || introduction.toUserId !== user.id) return jsonError("Introduction not found.", 404);
  if (await blockedEitherWay(user.id, introduction.fromUserId)) {
    return jsonError("This introduction is no longer available.", 409);
  }
  if (action === "decline") {
    if (introduction.status !== "PENDING") {
      return NextResponse.json({ status: introduction.status, match: null });
    }
    const declined = await prisma.introduction.update({
      where: { id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    return NextResponse.json({ status: declined.status, match: null });
  }

  const firstUserId = [user.id, introduction.fromUserId].sort()[0];
  const secondUserId = [user.id, introduction.fromUserId].sort()[1];
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingByIntro = await tx.match.findUnique({
        where: { introductionId: id },
        include: { conversation: true },
      });
      if (existingByIntro) return existingByIntro;

      const existingPair = await tx.match.findUnique({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        include: { conversation: true },
      });
      if (existingPair) {
        if (existingPair.status !== "ACTIVE") throw new Error("This match has already ended.");
        await tx.introduction.update({
          where: { id },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        return existingPair;
      }
      if (introduction.status !== "PENDING") throw new Error("This introduction has already been answered.");

      const match = await tx.match.create({
        data: {
          firstUserId,
          secondUserId,
          introductionId: id,
          conversation: { create: {} },
        },
        include: { conversation: true },
      });
      await tx.introduction.update({
        where: { id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      return match;
    });
    return NextResponse.json({ status: "ACCEPTED", match: result });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await prisma.match.findUnique({
        where: { introductionId: id },
        include: { conversation: true },
      });
      if (existing) return NextResponse.json({ status: "ACCEPTED", match: existing });
      const pairMatch = await prisma.match.findUnique({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        include: { conversation: true },
      });
      if (pairMatch?.status === "ACTIVE") {
        await prisma.introduction.update({
          where: { id },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        return NextResponse.json({ status: "ACCEPTED", match: pairMatch });
      }
      return jsonError("This match has already ended.", 409);
    }
    if (error instanceof Error && error.message === "This match has already ended.") {
      return jsonError(error.message, 409);
    }
    if (error instanceof Error && error.message === "This introduction has already been answered.") {
      return jsonError(error.message, 409);
    }
    throw error;
  }
}
