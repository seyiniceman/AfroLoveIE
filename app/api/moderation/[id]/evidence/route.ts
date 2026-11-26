import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseImageDataUrl } from "@/lib/media";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getRequestUser(request);
  if (viewer?.role !== "MODERATOR") return new NextResponse(null, { status: viewer ? 403 : 401 });
  const { id } = await context.params;
  const report = await prisma.report.findUnique({ where: { id }, select: { evidenceKind: true, evidenceData: true } });
  if (report?.evidenceKind !== "PHOTO" || !report.evidenceData) return new NextResponse(null, { status: 404 });
  const image = parseImageDataUrl(report.evidenceData);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(image.bytes, {
    headers: { "Content-Type": image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
