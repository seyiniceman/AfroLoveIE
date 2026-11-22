import { NextRequest, NextResponse } from "next/server";
import { blockedEitherWay, getRequestUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseImageDataUrl } from "@/lib/media";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const viewer = await getRequestUser(request);
  if (!viewer) return new NextResponse(null, { status: 401 });
  const { id } = await context.params;
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { user: { select: { role: true, profile: true } } },
  });
  if (!photo || photo.user.role !== "MEMBER") return new NextResponse(null, { status: 404 });

  let allowed = photo.userId === viewer.id;
  if (!allowed && viewer.role === "MEMBER" && viewer.profile && photo.user.profile) {
    const blocked = await blockedEitherWay(viewer.id, photo.userId);
    if (!blocked) {
      const [activeMatch, pendingIntroduction, previousMatch] = await Promise.all([
        prisma.match.findFirst({
          where: {
            status: "ACTIVE",
            OR: [
              { firstUserId: viewer.id, secondUserId: photo.userId },
              { firstUserId: photo.userId, secondUserId: viewer.id },
            ],
          },
          select: { id: true },
        }),
        prisma.introduction.findFirst({
          where: {
            status: "PENDING",
            OR: [
              { fromUserId: viewer.id, toUserId: photo.userId },
              { fromUserId: photo.userId, toUserId: viewer.id },
            ],
          },
          select: { id: true },
        }),
        prisma.match.findFirst({
          where: {
            OR: [
              { firstUserId: viewer.id, secondUserId: photo.userId },
              { firstUserId: photo.userId, secondUserId: viewer.id },
            ],
          },
          select: { id: true },
        }),
      ]);
      const discoverable = !previousMatch &&
        viewer.profile.city === photo.user.profile.city &&
        viewer.profile.relationshipIntent === photo.user.profile.relationshipIntent;
      allowed = Boolean(activeMatch || pendingIntroduction || discoverable);
    }
  }
  if (!allowed) return new NextResponse(null, { status: 404 });

  const image = parseImageDataUrl(photo.url);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(image.bytes.byteLength),
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
