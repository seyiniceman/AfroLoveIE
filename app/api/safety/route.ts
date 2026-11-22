import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reportReasons } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to use safety tools.", 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
  if (!subjectId || subjectId === user.id) return jsonError("Choose another member.");
  const subject = await prisma.user.findUnique({
    where: { id: subjectId },
    select: { id: true, role: true },
  });
  if (!subject || subject.role !== "MEMBER") return jsonError("Member not found.", 404);

  if (body.action === "block") {
    await prisma.$transaction(async (tx) => {
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: user.id, blockedId: subjectId } },
        create: { blockerId: user.id, blockedId: subjectId },
        update: {},
      });
      const [firstUserId, secondUserId] = [user.id, subjectId].sort();
      await tx.match.updateMany({
        where: { firstUserId, secondUserId, status: "ACTIVE" },
        data: { status: "UNMATCHED", endedAt: new Date() },
      });
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "report") {
    const reason = typeof body.reason === "string" ? body.reason : "";
    const details = typeof body.details === "string" ? body.details.trim() : "";
    if (!reportReasons.includes(reason as (typeof reportReasons)[number])) {
      return jsonError("Choose a report reason.");
    }
    if (details.length > 2000) return jsonError("Report details must be 2,000 characters or fewer.");
    const report = await prisma.report.create({
      data: { reporterId: user.id, subjectId, reason, details },
      select: { id: true, status: true, createdAt: true },
    });
    return NextResponse.json({ report }, { status: 201 });
  }

  return jsonError("Choose block or report.");
}
