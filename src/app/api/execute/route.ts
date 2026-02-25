import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";
const EXEC_TIMEOUT_MS = 10_000;

async function executePiston(code: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "python",
        version: "3.10.0",
        files: [{ content: code }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const result = await response.json();
    return {
      stdout: result.run?.stdout || "",
      stderr: result.run?.stderr || "",
      code: result.run?.code ?? -1,
      signal: result.run?.signal || null,
      output: result.run?.output || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeLocal(code: string): Promise<{
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
  output: string;
}> {
  const filename = join(tmpdir(), `cs_${randomUUID()}.py`);
  await writeFile(filename, code, "utf-8");

  return new Promise((resolve) => {
    const child = exec(
      `python3 "${filename}"`,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 512 },
      async (error, stdout, stderr) => {
        await unlink(filename).catch(() => {});
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          code: error ? (error.code ?? 1) : 0,
          signal: error?.signal || null,
          output: (stdout || "") + (stderr || ""),
        });
      }
    );

    setTimeout(() => {
      child.kill("SIGTERM");
    }, EXEC_TIMEOUT_MS);
  });
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "No code provided" },
        { status: 400 }
      );
    }

    const pistonResult = await executePiston(code);
    if (pistonResult) {
      return NextResponse.json(pistonResult);
    }

    const localResult = await executeLocal(code);
    return NextResponse.json(localResult);
  } catch {
    return NextResponse.json(
      { error: "Execution failed" },
      { status: 500 }
    );
  }
}
