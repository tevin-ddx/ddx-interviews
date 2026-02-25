import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const note = await prisma.interviewNote.findFirst({
    where: { interviewId: (await params).id, authorId: session.userId },
  });

  return NextResponse.json({ note });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { content } = await request.json();

  const existing = await prisma.interviewNote.findFirst({
    where: { interviewId: id, authorId: session.userId },
  });

  if (existing) {
    const note = await prisma.interviewNote.update({
      where: { id: existing.id },
      data: { content },
    });
    return NextResponse.json({ note });
  }

  const note = await prisma.interviewNote.create({
    data: {
      interviewId: id,
      authorId: session.userId,
      content,
    },
  });
  return NextResponse.json({ note });
}
