import type { getRequestUser } from "@/lib/auth";
import { blockedEitherWay } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDiscover } from "@/lib/profile-options";

type Viewer = NonNullable<Awaited<ReturnType<typeof getRequestUser>>>;

export async function visibleMemberPhoto(viewer: Viewer, id: string) {
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { user: { select: { role: true, emailVerifiedAt: true, profile: true } } },
  });
  if (!photo || photo.user.role !== "MEMBER") return null;
  if (photo.userId === viewer.id) return photo;
  if (viewer.role !== "MEMBER" || !viewer.profile?.published || !photo.user.profile?.published ||
      await blockedEitherWay(viewer.id, photo.userId)) return null;

  const [firstUserId, secondUserId] = [viewer.id, photo.userId].sort();
  const [match, pending] = await Promise.all([
    prisma.match.findUnique({
      where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
      select: { status: true },
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
  ]);
  const discoverable = !match && photo.user.emailVerifiedAt && canDiscover(viewer.profile, photo.user.profile);
  return match?.status === "ACTIVE" || pending || discoverable ? photo : null;
}
