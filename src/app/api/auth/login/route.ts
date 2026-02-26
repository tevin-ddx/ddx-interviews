import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "Admin credentials not configured" },
        { status: 500 }
      );
    }

    if (email !== adminEmail || password !== adminPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    await createSession("admin", email);

    return NextResponse.json({
      success: true,
      user: { id: "admin", name: "Admin", email },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
