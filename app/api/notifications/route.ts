import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestUser, jsonError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to view notifications.", 401);
  const [unreadMessages, pendingIntroductions] = await Promise.all([
    prisma.message.count({
      where: {
        readAt: null, senderId: { not: user.id },
        conversation: {
          match: { status: "ACTIVE", OR: [{ firstUserId: user.id }, { secondUserId: user.id }] },
        },
      },
    }),
    prisma.introduction.count({
      where: {
        toUserId: user.id, status: "PENDING",
        fromUser: {
          blocksMade: { none: { blockedId: user.id } },
          blocksReceived: { none: { blockerId: user.id } },
        },
      },
    }),
  ]);
  return NextResponse.json({ unreadMessages, pendingIntroductions });
}
