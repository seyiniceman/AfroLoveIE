import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageOnDate } from "@/lib/validation";
import { protectedPhoto } from "@/lib/media";
import { canDiscover, compatibleIntents, isPromptKey, visibleProfile } from "@/lib/profile-options";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to discover people.", 401);
  if (!user.profile?.published || user.profile.discoveryPaused) return NextResponse.json({ profiles: [] });

  const [blocks, matches, sentIntros] = await Promise.all([
    prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.match.findMany({
      where: {
        OR: [{ firstUserId: user.id }, { secondUserId: user.id }],
      },
      select: { firstUserId: true, secondUserId: true },
    }),
    prisma.introduction.findMany({
      where: { fromUserId: user.id, status: "PENDING" },
      select: { toUserId: true },
    }),
  ]);
  const excluded = new Set<string>([
    user.id,
    ...blocks.map((block) => (block.blockerId === user.id ? block.blockedId : block.blockerId)),
    ...matches.map((match) => (match.firstUserId === user.id ? match.secondUserId : match.firstUserId)),
    ...sentIntros.map((intro) => intro.toUserId),
  ]);

  const profiles = await prisma.profile.findMany({
    where: {
      userId: { notIn: [...excluded] },
      published: true,
      discoveryPaused: false,
      AND: [{
        OR: user.profile.county
          ? [
              { county: user.profile.county },
              { county: null, city: { equals: user.profile.city, mode: "insensitive" } },
            ]
          : [{ city: { equals: user.profile.city, mode: "insensitive" } }],
      }],
      OR: [
        { relationshipIntents: { hasSome: compatibleIntents(user.profile) } },
        { AND: [{ relationshipIntents: { isEmpty: true } }, { relationshipIntent: { in: compatibleIntents(user.profile) } }] },
      ],
      user: { role: "MEMBER", emailVerifiedAt: { not: null } },
    },
    include: {
      user: { select: { id: true, dateOfBirth: true } },
    },
    orderBy: { displayName: "asc" },
  });

  const withPhotos = await Promise.all(
    profiles.map(async (profile) => ({
      userId: profile.userId,
      ...visibleProfile(profile),
      age: ageOnDate(profile.user.dateOfBirth),
      photos: (await prisma.photo.findMany({
        where: { userId: profile.userId },
        orderBy: { position: "asc" },
      })).map(protectedPhoto),
    })),
  );
  return NextResponse.json({ profiles: withPhotos });
}

export async function POST(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to send an introduction.", 401);
  if (!user.profile?.published || user.profile.discoveryPaused) return jsonError("Publish and enable discovery before sending an introduction.", 403);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";
  const promptKey = isPromptKey(body.promptKey) ? body.promptKey : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!toUserId || !promptKey || message.length < 8 || message.length > 500) {
    return jsonError("Choose a profile prompt and write an introduction of 8 to 500 characters.");
  }
  if (toUserId === user.id) return jsonError("You cannot introduce yourself.", 400);
  if (await blockedEitherWay(user.id, toUserId)) return jsonError("This profile is no longer available.", 404);
  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, role: true, emailVerifiedAt: true, profile: true },
  });
  if (!target?.profile || target.role !== "MEMBER" || !target.emailVerifiedAt || !canDiscover(user.profile, target.profile)) {
    return jsonError("Profile not found.", 404);
  }
  if (!target.profile[promptKey]) return jsonError("Choose a prompt the member has answered.");
  const existingMatch = await prisma.match.findFirst({
    where: {
      OR: [
        { firstUserId: user.id, secondUserId: toUserId },
        { firstUserId: toUserId, secondUserId: user.id },
      ],
    },
    select: { id: true },
  });
  if (existingMatch) return jsonError("You have already been connected to this member.", 409);
  const existing = await prisma.introduction.findFirst({
    where: { fromUserId: user.id, toUserId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return jsonError("You already have an introduction waiting for this member.", 409);

  const introduction = await prisma.introduction.create({
    data: { fromUserId: user.id, toUserId, promptKey, message },
  });
  return NextResponse.json({ introduction }, { status: 201 });
}
