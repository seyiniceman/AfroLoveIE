import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, jsonError, sameOriginMutationError } from "@/lib/auth";
import { prisma } from "@/lib/db";

const outcomes = ["POLICY_VIOLATION", "NO_VIOLATION", "INSUFFICIENT_EVIDENCE"] as const;

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to review reports.", 401);
  if (user.role !== "MODERATOR") return jsonError("Moderator access required.", 403);
  const status = request.nextUrl.searchParams.get("status");
  if (status && status !== "OPEN" && status !== "REVIEWING" && status !== "RESOLVED") return jsonError("Unknown report status.");
  const reports = await prisma.report.findMany({
    where: status === "OPEN" || status === "REVIEWING" || status === "RESOLVED" ? { status } : undefined,
    select: {
      id: true, reason: true, details: true, status: true, createdAt: true,
      evidenceKind: true, outcome: true, moderatorId: true,
      reporter: { select: { profile: { select: { displayName: true } } } },
      subject: { select: { profile: { select: { displayName: true } } } },
      moderator: { select: { profile: { select: { displayName: true } } } },
      reviews: {
        orderBy: { createdAt: "desc" }, take: 10,
        select: {
          id: true, status: true, outcome: true, note: true, createdAt: true,
          moderator: { select: { profile: { select: { displayName: true } } } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  const messages = await prisma.report.findMany({
    where: { id: { in: reports.filter((report) => report.evidenceKind === "MESSAGE").map((report) => report.id) } },
    select: { id: true, evidenceData: true },
  });
  const messageEvidence = new Map(messages.map((message) => [message.id, message.evidenceData]));
  return NextResponse.json({
    reports: reports.map((report) => ({
      ...report,
      messageEvidence: messageEvidence.get(report.id) ?? null,
      photoEvidenceUrl: report.evidenceKind === "PHOTO" ? `/api/moderation/${report.id}/evidence` : null,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const user = await getRequestUser(request);
  if (!user) return jsonError("Sign in to update reports.", 401);
  if (user.role !== "MODERATOR") return jsonError("Moderator access required.", 403);
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const outcome = status === "RESOLVED" && outcomes.includes(body?.outcome) ? body.outcome as (typeof outcomes)[number] : null;
  if (!id || (status !== "REVIEWING" && status !== "RESOLVED")) return jsonError("Choose a report and a supported review status.");
  if (note.length > 1000) return jsonError("Use 1,000 characters or fewer for the review note.");
  if (status === "RESOLVED" && (!outcome || !note)) return jsonError("Choose an outcome and add a review note to resolve this report.");

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.report.findUnique({
      where: { id }, select: { status: true, moderatorId: true, updatedAt: true },
    });
    if (!current) return { error: "Report not found.", status: 404 } as const;
    if (current.status === "RESOLVED" || (current.moderatorId && current.moderatorId !== user.id) ||
        (status === "RESOLVED" && current.moderatorId !== user.id)) {
      return { error: "Claim an available report before reviewing or resolving it.", status: 409 } as const;
    }
    if (current.status === "REVIEWING" && current.moderatorId === user.id && status === "REVIEWING" && !note) {
      return { error: "Add a note to update this review.", status: 400 } as const;
    }
    const changed = await tx.report.updateMany({
      where: { id, status: current.status, moderatorId: current.moderatorId, updatedAt: current.updatedAt },
      data: { status, moderatorId: user.id, outcome },
    });
    if (changed.count !== 1) return { error: "Another reviewer changed this report. Refresh and try again.", status: 409 } as const;
    await tx.reportReview.create({ data: { reportId: id, moderatorId: user.id, status, outcome, note } });
    return { report: { id, status, outcome } };
  });
  return result.error ? jsonError(result.error, result.status) : NextResponse.json(result);
}
