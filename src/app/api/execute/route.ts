import { NextRequest, NextResponse } from "next/server";
import { exec, execSync } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const JUDGE0_URL = "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true";
const JUDGE0_LANG: Record<string, number> = { python: 71, cpp: 54 };

const EXEC_TIMEOUT_MS = 30_000;
const DOCKER_IMAGE = "codestream-runner";
const DOCKER_FALLBACK_PY = "python:3.12-alpine";

const IS_VERCEL = !!process.env.VERCEL;

let dockerState: { available: boolean; hasCustomImage: boolean } | null = null;

function checkDocker() {
  if (IS_VERCEL) return { available: false, hasCustomImage: false };
  if (dockerState !== null) return dockerState;
  try {
    execSync("docker info", { stdio: "ignore", timeout: 3000 });
    let hasCustomImage = false;
    try {
      const out = execSync(`docker images -q ${DOCKER_IMAGE}`, { timeout: 3000 }).toString().trim();
      hasCustomImage = out.length > 0;
    } catch { /* no custom image */ }
    dockerState = { available: true, hasCustomImage };
  } catch {
    dockerState = { available: false, hasCustomImage: false };
  }
  return dockerState;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
  output: string;
  engine: string;
}

// --- Vercel Sandbox execution (Firecracker microVM) ---

async function executeSandbox(
  code: string,
  language: string,
): Promise<ExecResult | null> {
  try {
    const { Sandbox } = await import("@vercel/sandbox");

    const snapshotId = process.env.SANDBOX_SNAPSHOT_ID;
    const needsPackages =
      language === "python" &&
      /\b(import|from)\s+(numpy|pandas|torch)\b/.test(code);

    let sandbox;
    try {
      sandbox =
        snapshotId && needsPackages
          ? await Sandbox.create({
              source: { type: "snapshot" as const, snapshotId },
              timeout: EXEC_TIMEOUT_MS,
            })
          : await Sandbox.create({
              runtime: "python3.13",
              timeout: EXEC_TIMEOUT_MS,
            });
    } catch {
      sandbox = await Sandbox.create({
        runtime: "python3.13",
        timeout: EXEC_TIMEOUT_MS,
      });
    }

    try {
      if (language === "shell") {
        const result = await sandbox.runCommand("bash", ["-c", code]);
        const stdout = (await result.stdout()) || "";
        const stderr = (await result.stderr()) || "";
        return {
          stdout,
          stderr,
          code: result.exitCode ?? 1,
          signal: null,
          output: stdout + stderr,
          engine: "sandbox",
        };
      }

      if (language === "python") {
        const result = await sandbox.runCommand("python3", ["-c", code]);
        const stdout = (await result.stdout()) || "";
        const stderr = (await result.stderr()) || "";
        return {
          stdout,
          stderr,
          code: result.exitCode ?? 1,
          signal: null,
          output: stdout + stderr,
          engine: "sandbox",
        };
      }

      if (language === "cpp") {
        await sandbox.writeFiles([
          { path: "code.cpp", content: Buffer.from(code) },
        ]);
        await sandbox.runCommand("sudo", [
          "dnf", "install", "-y", "-q", "gcc-c++",
        ]);
        const result = await sandbox.runCommand("bash", [
          "-c",
          "g++ -O2 -std=c++17 -o /tmp/prog code.cpp && /tmp/prog",
        ]);
        const stdout = (await result.stdout()) || "";
        const stderr = (await result.stderr()) || "";
        return {
          stdout,
          stderr,
          code: result.exitCode ?? 1,
          signal: null,
          output: stdout + stderr,
          engine: "sandbox",
        };
      }
    } finally {
      sandbox.stop().catch(() => {});
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[execute] Sandbox error: ${msg}`);
  }
  return null;
}

// --- Docker execution (local dev) ---

function dockerExec(
  cmd: string,
  timeout: number,
): Promise<ExecResult & { ok: boolean }> {
  return new Promise((resolve) => {
    const child = exec(
      cmd,
      { timeout, maxBuffer: 1024 * 512 },
      (error, stdout, stderr) => {
        resolve({
          ok: true,
          stdout: stdout || "",
          stderr: stderr || "",
          code: error ? (error.code ?? 1) : 0,
          signal: error?.signal || null,
          output: (stdout || "") + (stderr || ""),
          engine: "docker",
        });
      },
    );
    setTimeout(() => child.kill("SIGTERM"), timeout);
  });
}

async function executeDockerPython(code: string): Promise<ExecResult | null> {
  const { available, hasCustomImage } = checkDocker();
  if (!available) return null;

  const filename = `cs_${randomUUID()}.py`;
  const hostPath = join(tmpdir(), filename);
  await writeFile(hostPath, code, "utf-8");

  const image = hasCustomImage ? DOCKER_IMAGE : DOCKER_FALLBACK_PY;
  const cmd = [
    "docker run --rm",
    "--network none",
    "--memory 256m",
    "--cpus 1",
    `-v "${hostPath}:/code/${filename}:ro"`,
    image,
    `python /code/${filename}`,
  ].join(" ");

  const result = await dockerExec(cmd, EXEC_TIMEOUT_MS);
  await unlink(hostPath).catch(() => {});
  return result;
}

async function executeDockerCpp(code: string): Promise<ExecResult | null> {
  const { available, hasCustomImage } = checkDocker();
  if (!available) return null;

  const id = randomUUID().slice(0, 8);
  const srcFile = `cs_${id}.cpp`;
  const hostPath = join(tmpdir(), srcFile);
  await writeFile(hostPath, code, "utf-8");

  const image = hasCustomImage ? DOCKER_IMAGE : "gcc:14";
  const compileAndRun = `g++ -O2 -std=c++17 -o /tmp/prog /code/${srcFile} && /tmp/prog`;
  const cmd = [
    "docker run --rm",
    "--network none",
    "--memory 256m",
    "--cpus 1",
    `-v "${hostPath}:/code/${srcFile}:ro"`,
    image,
    `sh -c '${compileAndRun}'`,
  ].join(" ");

  const result = await dockerExec(cmd, EXEC_TIMEOUT_MS);
  await unlink(hostPath).catch(() => {});
  return result;
}

// --- Judge0 CE API (free fallback) ---

async function executeJudge0(
  code: string,
  language: string,
): Promise<ExecResult | null> {
  const languageId = JUDGE0_LANG[language];
  if (!languageId) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(JUDGE0_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Judge0 API returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    const accepted = result.status?.id === 3;
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || result.compile_output || "",
      code: accepted ? 0 : 1,
      signal: null,
      output: (result.stdout || "") + (result.stderr || ""),
      engine: "judge0",
    };
  } catch (err) {
    console.error("Judge0 API error:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Local execution (dev only) ---

async function executeLocalPython(code: string): Promise<ExecResult> {
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
          engine: "local",
        });
      },
    );
    setTimeout(() => child.kill("SIGTERM"), EXEC_TIMEOUT_MS);
  });
}

async function executeLocalCpp(code: string): Promise<ExecResult> {
  const id = randomUUID().slice(0, 8);
  const srcFile = join(tmpdir(), `cs_${id}.cpp`);
  const binFile = join(tmpdir(), `cs_${id}`);
  await writeFile(srcFile, code, "utf-8");

  return new Promise((resolve) => {
    exec(
      `g++ -O2 -std=c++17 -o "${binFile}" "${srcFile}" && "${binFile}"`,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 512 },
      async (error, stdout, stderr) => {
        await unlink(srcFile).catch(() => {});
        await unlink(binFile).catch(() => {});
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          code: error ? (error.code ?? 1) : 0,
          signal: error?.signal || null,
          output: (stdout || "") + (stderr || ""),
          engine: "local",
        });
      },
    );
  });
}

// --- Route handler ---
// Fallback chain: Docker → Vercel Sandbox → Judge0 → local

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { code, language = "python" } = await request.json();

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "No code provided" },
        { status: 400 },
      );
    }

    // 1. Docker (local dev with Docker running)
    const dockerResult =
      language === "cpp"
        ? await executeDockerCpp(code)
        : await executeDockerPython(code);
    if (dockerResult) return NextResponse.json(dockerResult);

    // 2. Vercel Sandbox (production on Vercel)
    if (IS_VERCEL) {
      const sandboxResult = await executeSandbox(code, language);
      if (sandboxResult) return NextResponse.json(sandboxResult);
    }

    // 3. Judge0 CE API (free public fallback)
    const judge0Result = await executeJudge0(code, language);
    if (judge0Result) return NextResponse.json(judge0Result);

    // 4. Local execution (dev only, needs python3/g++ installed)
    if (!IS_VERCEL) {
      const localResult =
        language === "cpp"
          ? await executeLocalCpp(code)
          : await executeLocalPython(code);
      return NextResponse.json(localResult);
    }

    return NextResponse.json({
      stdout: "",
      stderr: "All execution engines unavailable. Please try again.",
      code: 1,
      signal: null,
      output: "",
      engine: "none",
    });
  } catch (err) {
    console.error("Execute route error:", err);
    return NextResponse.json(
      { error: "Execution failed" },
      { status: 500 },
    );
  }
}
