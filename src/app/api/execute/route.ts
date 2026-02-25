import { NextRequest, NextResponse } from "next/server";
import { exec, execSync } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";
const EXEC_TIMEOUT_MS = 30_000;
const DOCKER_IMAGE = "codestream-runner";
const DOCKER_FALLBACK_PY = "python:3.12-alpine";

let dockerState: { available: boolean; hasCustomImage: boolean } | null = null;

function checkDocker() {
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

function dockerExec(cmd: string, timeout: number): Promise<ExecResult & { ok: boolean }> {
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
      }
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

async function executePiston(
  code: string,
  language: string
): Promise<ExecResult | null> {
  const langMap: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "3.10.0" },
    cpp: { language: "c++", version: "10.2.0" },
  };
  const lang = langMap[language];
  if (!lang) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: lang.language,
        version: lang.version,
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
      engine: "piston",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
      }
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
      }
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    const { code, language = "python" } = await request.json();

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "No code provided" },
        { status: 400 }
      );
    }

    if (language === "cpp") {
      const dockerResult = await executeDockerCpp(code);
      if (dockerResult) return NextResponse.json(dockerResult);

      const pistonResult = await executePiston(code, "cpp");
      if (pistonResult) return NextResponse.json(pistonResult);

      const localResult = await executeLocalCpp(code);
      return NextResponse.json(localResult);
    }

    // Python (default)
    const dockerResult = await executeDockerPython(code);
    if (dockerResult) return NextResponse.json(dockerResult);

    const pistonResult = await executePiston(code, "python");
    if (pistonResult) return NextResponse.json(pistonResult);

    const localResult = await executeLocalPython(code);
    return NextResponse.json(localResult);
  } catch {
    return NextResponse.json(
      { error: "Execution failed" },
      { status: 500 }
    );
  }
}
