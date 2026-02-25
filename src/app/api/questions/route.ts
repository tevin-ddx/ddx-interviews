import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const questions = await prisma.question.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(questions);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const question = await prisma.question.create({
      data: {
        title: body.title,
        description: body.description,
        boilerplateCode: body.boilerplateCode || "",
        difficulty: body.difficulty || "medium",
        category: body.category || "",
      },
    });
    return NextResponse.json(question, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create question" },
      { status: 500 }
    );
  }
}
