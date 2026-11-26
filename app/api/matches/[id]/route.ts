import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

async function activeConversation(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { conversation: true },
  });
  if (!match || (match.firstUserId !== userId && match.secondUserId !== userId)) {
    return { ok: false as const, error: "Match not found.", status: 404 as const };
  }
  if (match.status !== "ACTIVE" || await blockedEitherWay(match.firstUserId, match.secondUserId)) {
    return { ok: false as const, error: "This conversation is no longer available.", status: 403 as const };
  }
  const conversation = match.conversation;
  if (!conversation) return { ok: false as const, error: "Conversation not found.", status: 404 as const };
  return { ok: true as const, match, conversation };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to view messages.", 401);
  const { id } = await context.params;
  const access = await activeConversation(id, user.id);
  if (!access.ok) return jsonError(access.error, access.status);
  const messages = await prisma.message.findMany({
    where: { conversationId: access.conversation.id },
    include: { sender: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    messages: messages.map(({ readAt, ...message }) => ({
      ...message,
      unread: message.senderId !== user.id && readAt === null,
    })),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to send messages.", 401);
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!messageBody || messageBody.length > 2000) return jsonError("Messages must contain 1 to 2,000 characters.");

  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id },
      include: { conversation: true },
    });
    if (!match || (match.firstUserId !== user.id && match.secondUserId !== user.id)) {
      return { error: "Match not found.", status: 404 as const };
    }
    if (match.status !== "ACTIVE") return { error: "This conversation is no longer active.", status: 403 as const };
    const block = await tx.block.findFirst({
      where: {
        OR: [
          { blockerId: match.firstUserId, blockedId: match.secondUserId },
          { blockerId: match.secondUserId, blockedId: match.firstUserId },
        ],
      },
      select: { id: true },
    });
    if (block) return { error: "Messaging is unavailable because this connection is blocked.", status: 403 as const };
    if (!match.conversation) return { error: "Conversation not found.", status: 404 as const };
    const message = await tx.message.create({
      data: { conversationId: match.conversation.id, senderId: user.id, body: messageBody },
      include: { sender: { select: { id: true } } },
    });
    return { message };
  }, { isolationLevel: "Serializable" });

  if ("error" in result && result.error) return jsonError(result.error, result.status);
  return NextResponse.json({ message: result.message }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to update a match.", 401);
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  if (body.action === "mark-read") {
    const ids = body.messageIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 ||
        !ids.every((value) => typeof value === "string" && value.length <= 64)) {
      return jsonError("Choose up to 200 messages to mark as read.");
    }
    const access = await activeConversation(id, user.id);
    if (!access.ok) return jsonError(access.error, access.status);
    await prisma.message.updateMany({
      where: { id: { in: ids }, conversationId: access.conversation.id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "unmatch") return jsonError("Choose a supported match action.");
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match || (match.firstUserId !== user.id && match.secondUserId !== user.id)) {
    return jsonError("Match not found.", 404);
  }
  await prisma.match.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "UNMATCHED", endedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
