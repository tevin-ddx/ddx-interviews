import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const interview = await prisma.interview.update({
    where: { id },
    data: {
      status: "completed",
      endedAt: new Date(),
      code: body.finalCode || undefined,
    },
  });

  return NextResponse.json(interview);
}
