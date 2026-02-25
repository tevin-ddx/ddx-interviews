import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const interviews = await prisma.interview.findMany({
    include: { question: { select: { title: true, difficulty: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(interviews);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const interview = await prisma.interview.create({
      data: {
        id: uuidv4(),
        title: body.title || "Untitled Interview",
        questionId: body.questionId || null,
        code: body.code || "",
        language: body.language || "python",
      },
    });
    return NextResponse.json(interview, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create interview" },
      { status: 500 }
    );
  }
}
