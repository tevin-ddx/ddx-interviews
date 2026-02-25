import { NextRequest, NextResponse } from "next/server";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

export async function POST(request: NextRequest) {
  try {
    const { code, language = "python", version = "3.10.0" } = await request.json();

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "No code provided" },
        { status: 400 }
      );
    }

    const response = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        version,
        files: [{ content: code }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Execution service unavailable" },
        { status: 502 }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      stdout: result.run?.stdout || "",
      stderr: result.run?.stderr || "",
      code: result.run?.code ?? -1,
      signal: result.run?.signal || null,
      output: result.run?.output || "",
    });
  } catch {
    return NextResponse.json(
      { error: "Execution failed" },
      { status: 500 }
    );
  }
}
