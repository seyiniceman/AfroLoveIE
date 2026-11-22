import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser, jsonError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageOnDate } from "@/lib/validation";
import { protectedPhoto } from "@/lib/media";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to view matches.", 401);
  const matches = await prisma.match.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ firstUserId: user.id }, { secondUserId: user.id }],
    },
    include: {
      firstUser: { select: { id: true, dateOfBirth: true, profile: true, photos: { orderBy: { position: "asc" } } } },
      secondUser: { select: { id: true, dateOfBirth: true, profile: true, photos: { orderBy: { position: "asc" } } } },
      conversation: {
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const result = await Promise.all(
    matches.map(async (match) => {
      if (await blockedEitherWay(match.firstUserId, match.secondUserId)) return null;
      const other = match.firstUserId === user.id ? match.secondUser : match.firstUser;
      return {
        id: match.id,
        createdAt: match.createdAt,
        conversationId: match.conversation?.id,
        otherUser: {
          id: other.id,
          age: ageOnDate(other.dateOfBirth),
          profile: other.profile,
          photos: other.photos.map(protectedPhoto),
        },
        lastMessage: match.conversation?.messages[0] ?? null,
      };
    }),
  );
  return NextResponse.json({ matches: result.filter((match) => match !== null) });
}
