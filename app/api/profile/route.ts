import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import { parseImageDataUrl } from "@/lib/media";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to view your profile.", 401);
  const photos = await prisma.photo.findMany({
    where: { userId: user.id },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ profile: user.profile, photos });
}

export async function PUT(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to edit your profile.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Profile is invalid.");
  if (parsed.data.photos.length > 0 &&
      !parsed.data.photos.every((photo) => parseImageDataUrl(photo.url) !== null)) {
    return jsonError("Upload a valid JPEG, PNG, or WebP image that is 2 MB or smaller.");
  }
  const totalPhotoBytes = parsed.data.photos.reduce((total, photo) => {
    const image = parseImageDataUrl(photo.url);
    return total + (image?.bytes.byteLength ?? 0);
  }, 0);
  if (totalPhotoBytes > 6 * 1024 * 1024) {
    return jsonError("All profile photos together must be 6 MB or smaller.");
  }

  const { photos, ...profile } = parsed.data;
  const saved = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profile },
      update: profile,
    });
    await tx.photo.deleteMany({ where: { userId: user.id } });
    if (photos.length) {
      await tx.photo.createMany({
        data: photos.map((photo, position) => ({ ...photo, userId: user.id, position })),
      });
    }
    return updatedProfile;
  });

  const savedPhotos = await prisma.photo.findMany({
    where: { userId: user.id },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ profile: saved, photos: savedPhotos });
}
