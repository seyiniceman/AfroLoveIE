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

  const { photos, saveMode, relationshipIntents, ...profile } = parsed.data;
  const selectedIntents = [...new Set(relationshipIntents ?? [profile.relationshipIntent])];
  const data = {
    ...profile,
    relationshipIntents: selectedIntents,
    relationshipIntent: selectedIntents[0] ?? profile.relationshipIntent,
  };
  if (saveMode === "draft" && user.profile?.published) {
    return jsonError("Published profiles must be saved from the profile editor.", 409);
  }
  const saved = await prisma.$transaction(async (tx) => {
    if (saveMode === "draft") {
      const updated = await tx.profile.updateMany({
        where: { userId: user.id, published: false },
        data,
      });
      if (updated.count !== 1) return null;
    } else {
      await tx.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data, published: true },
        update: { ...data, published: true },
      });
    }
    await tx.photo.deleteMany({ where: { userId: user.id } });
    if (photos.length) {
      await tx.photo.createMany({
        data: photos.map((photo, position) => ({ ...photo, userId: user.id, position })),
      });
    }
    const savedProfile = await tx.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const savedPhotos = await tx.photo.findMany({
      where: { userId: user.id },
      orderBy: { position: "asc" },
    });
    return { profile: savedProfile, photos: savedPhotos };
  });
  if (!saved) return jsonError("This profile changed. Reload before continuing.", 409);
  return NextResponse.json(saved);
}

export async function PATCH(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to change your discovery settings.", 401);
  if (!user.profile?.published) return jsonError("Publish your profile first.", 409);
  const body = await request.json().catch(() => null);
  if (typeof body?.discoveryPaused !== "boolean") return jsonError("Choose whether to pause discovery.");
  const profile = await prisma.profile.update({
    where: { userId: user.id },
    data: { discoveryPaused: body.discoveryPaused },
  });
  return NextResponse.json({ discoveryPaused: profile.discoveryPaused });
}
