import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const events = await prisma.interviewEvent.findMany({
    where: { interviewId: id },
    orderBy: { timestamp: "asc" },
  });

  const serialized = events.map((e) => ({
    ...e,
    timestamp: Number(e.timestamp),
  }));

  return NextResponse.json(serialized);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const events = body.events as Array<{
      timestamp: number;
      userName: string;
      type: string;
      content: string;
    }>;

    if (!events?.length) {
      return NextResponse.json({ error: "No events" }, { status: 400 });
    }

    await prisma.interviewEvent.createMany({
      data: events.map((e) => ({
        interviewId: id,
        timestamp: BigInt(e.timestamp),
        userName: e.userName,
        type: e.type || "edit",
        content: e.content,
      })),
    });

    return NextResponse.json({ saved: events.length });
  } catch {
    return NextResponse.json({ error: "Failed to save events" }, { status: 500 });
  }
}
