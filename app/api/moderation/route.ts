import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to review reports.", 401);
  if (user.role !== "MODERATOR") return jsonError("Moderator access required.", 403);
  const reports = await prisma.report.findMany({
    include: {
      reporter: { select: { id: true, profile: { select: { displayName: true } } } },
      subject: { select: { id: true, profile: { select: { displayName: true } } } },
      moderator: { select: { profile: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ reports });
}

export async function PATCH(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to update reports.", 401);
  if (user.role !== "MODERATOR") return jsonError("Moderator access required.", 403);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status;
  if (!id || (status !== "REVIEWING" && status !== "RESOLVED")) {
    return jsonError("Choose a report and a supported review status.");
  }
  const report = await prisma.report.update({
    where: { id },
    data: { status, moderatorId: user.id },
    select: { id: true, status: true, updatedAt: true },
  }).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) return null;
    throw error;
  });
  if (!report) return jsonError("Report not found.", 404);
  return NextResponse.json({ report });
}
