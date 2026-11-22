import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser, jsonError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageOnDate } from "@/lib/validation";
import { protectedPhoto } from "@/lib/media";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to view introductions.", 401);
  const introductions = await prisma.introduction.findMany({
    where: { toUserId: user.id, status: "PENDING" },
    include: {
      fromUser: {
        select: {
          id: true,
          dateOfBirth: true,
          profile: true,
          photos: { orderBy: { position: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const visible = introductions
    .filter((intro) => !intro.fromUser.profile ? false : true)
    .filter((intro) => !intro.fromUser.profile || intro.fromUser.profile.userId === intro.fromUser.id);
  const available = await Promise.all(
    visible.map(async (intro) => ({
      id: intro.id,
      promptKey: intro.promptKey,
      message: intro.message,
      createdAt: intro.createdAt,
      fromUser: {
        id: intro.fromUser.id,
        age: ageOnDate(intro.fromUser.dateOfBirth),
        profile: intro.fromUser.profile,
        photos: intro.fromUser.photos.map(protectedPhoto),
      },
      blocked: await blockedEitherWay(user.id, intro.fromUser.id),
    })),
  );
  return NextResponse.json({ introductions: available.filter((intro) => !intro.blocked) });
}
