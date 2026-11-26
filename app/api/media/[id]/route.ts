import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { parseImageDataUrl } from "@/lib/media";
import { visibleMemberPhoto } from "@/lib/photo-access";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getRequestUser(request);
  if (!viewer) return new NextResponse(null, { status: 401 });
  const { id } = await context.params;
  const photo = await visibleMemberPhoto(viewer, id);
  const image = photo ? parseImageDataUrl(photo.url) : null;
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
