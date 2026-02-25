import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { question: { include: { files: true } } },
  });
  if (!interview) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Strip solution from non-admin users
  if (!session && interview.question) {
    (interview.question as Record<string, unknown>).solutionCode = "";
  }

  return NextResponse.json(interview);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const interview = await prisma.interview.update({
      where: { id },
      data: {
        title: body.title,
        status: body.status,
        code: body.code,
        questionId: body.questionId,
      },
    });
    return NextResponse.json(interview);
  } catch {
    return NextResponse.json(
      { error: "Failed to update interview" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.interview.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete interview" },
      { status: 500 }
    );
  }
}
