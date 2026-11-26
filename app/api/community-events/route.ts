import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counties } from "@/lib/profile-options";
import { eventCategories } from "@/lib/community-events";

const eventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.enum(eventCategories),
  county: z.enum(counties),
  venue: z.string().trim().min(2).max(120),
  startsAt: z.iso.datetime(),
  url: z.string().trim().max(500).url().refine((value) => {
    const url = URL.parse(value);
    return url?.protocol === "https:" && !url.username && !url.password;
  }),
});

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user?.emailVerifiedAt) return jsonError("Verify your email and sign in to see events.", 401);
  const events = await prisma.communityEvent.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  return NextResponse.json({ events, canManage: user.role === "MODERATOR" });
}

export async function POST(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (user?.role !== "MODERATOR" || !user.emailVerifiedAt) return jsonError("Moderator access required.", 403);
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the event details and enter an HTTPS organiser link.");
  const startsAt = new Date(parsed.data.startsAt);
  if (startsAt <= new Date()) return jsonError("Choose a future start time.");
  const event = await prisma.communityEvent.create({ data: { ...parsed.data, startsAt } });
  return NextResponse.json({ event }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (user?.role !== "MODERATOR" || !user.emailVerifiedAt) return jsonError("Moderator access required.", 403);
  const id = request.nextUrl.searchParams.get("id");
  if (!id || id.length > 64) return jsonError("Choose an event to remove.");
  const result = await prisma.communityEvent.deleteMany({ where: { id } });
  if (!result.count) return jsonError("Event not found.", 404);
  return NextResponse.json({ removed: true });
}
