import { NextRequest, NextResponse } from "next/server";
import { exec, execSync } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const JUDGE0_URL = "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true";
const JUDGE0_LANG: Record<string, number> = { python: 71, cpp: 54 };

const EXEC_TIMEOUT_MS = 30_000;
const DOCKER_IMAGE = "ddx-runner";
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

// =============================================================================
// Persistent sandbox pool — kept alive across warm function invocations
// =============================================================================

interface PoolEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sandbox: any;
  lastUsed: number;
  initialized: boolean;
  gppInstalled: boolean;
}

const sandboxPool = new Map<string, PoolEntry>();
const POOL_IDLE_MS = 20 * 60 * 1000; // evict after 20 min idle
const SANDBOX_LIFETIME_MS = 25 * 60 * 1000; // VM timeout 25 min

// Python cell runner: persists namespace between cells via pickle
const CELL_RUNNER_PY = `
import sys, pickle, io, traceback, types, importlib

NS_FILE = '/tmp/_ns.pkl'
CODE_FILE = '/tmp/_cell.py'

ns = {'__builtins__': __builtins__}
try:
    with open(NS_FILE, 'rb') as _f:
        ns.update(pickle.load(_f))
except Exception:
    pass

with open(CODE_FILE) as _f:
    _code = _f.read()

try:
    _compiled = compile(_code, '<cell>', 'exec')
    exec(_compiled, ns)
except SystemExit:
    pass
except Exception:
    traceback.print_exc()

_to_save = {}
for _k, _v in ns.items():
    if _k.startswith('_'):
        continue
    try:
        pickle.dumps(_v)
        _to_save[_k] = _v
    except Exception:
        if isinstance(_v, types.ModuleType):
            _to_save[_k] = importlib.import_module(_v.__name__)
            continue
try:
    with open(NS_FILE, 'wb') as _f:
        pickle.dump(_to_save, _f)
except Exception:
    pass
`.trim();

function cleanupPool() {
  const now = Date.now();
  for (const [id, entry] of sandboxPool) {
    if (now - entry.lastUsed > POOL_IDLE_MS) {
      entry.sandbox.stop().catch(() => {});
      sandboxPool.delete(id);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSandbox(): Promise<any> {
  const { Sandbox } = await import("@vercel/sandbox");
  const snapshotId = process.env.SANDBOX_SNAPSHOT_ID;

  try {
    return snapshotId
      ? await Sandbox.create({
          source: { type: "snapshot" as const, snapshotId },
          timeout: SANDBOX_LIFETIME_MS,
        })
      : await Sandbox.create({
          runtime: "python3.13",
          timeout: SANDBOX_LIFETIME_MS,
        });
  } catch {
    return await Sandbox.create({
      runtime: "python3.13",
      timeout: SANDBOX_LIFETIME_MS,
    });
  }
}

async function getOrCreateSandbox(roomId: string): Promise<PoolEntry> {
  cleanupPool();

  const existing = sandboxPool.get(roomId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  const sandbox = await createSandbox();

  await sandbox.writeFiles([
    { path: "/tmp/_cell_runner.py", content: Buffer.from(CELL_RUNNER_PY) },
  ]);

  const entry: PoolEntry = {
    sandbox,
    lastUsed: Date.now(),
    initialized: true,
    gppInstalled: false,
  };
  sandboxPool.set(roomId, entry);
  return entry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractResult(result: any, engine: string): Promise<ExecResult> {
  const rawStdout = typeof result.stdout === "function" ? result.stdout() : result.stdout;
  const rawStderr = typeof result.stderr === "function" ? result.stderr() : result.stderr;
  const stdout = (await rawStdout) || "";
  const stderr = (await rawStderr) || "";
  return {
    stdout,
    stderr,
    code: result.exitCode ?? 1,
    signal: null,
    output: stdout + stderr,
    engine,
  };
}

async function ensureGpp(entry: PoolEntry): Promise<void> {
  if (entry.gppInstalled) return;
  const check = await entry.sandbox.runCommand("bash", ["-c", "which g++ 2>/dev/null"]);
  const checkResult = await extractResult(check, "sandbox-persistent");
  if (checkResult.code === 0) {
    entry.gppInstalled = true;
    return;
  }
  await entry.sandbox.runCommand("sudo", ["dnf", "install", "-y", "-q", "gcc-c++"]);
  entry.gppInstalled = true;
}

async function executePersistent(
  roomId: string,
  code: string,
  language: string,
  isCell: boolean,
): Promise<ExecResult | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (entry: PoolEntry): Promise<ExecResult> => {
    const { sandbox } = entry;

    if (language === "shell") {
      const r = await sandbox.runCommand("bash", ["-c", code]);
      return extractResult(r, "sandbox-persistent");
    }

    if (language === "python" && isCell) {
      await sandbox.writeFiles([
        { path: "/tmp/_cell.py", content: Buffer.from(code) },
      ]);
      const r = await sandbox.runCommand("python3", ["/tmp/_cell_runner.py"]);
      return extractResult(r, "sandbox-persistent");
    }

    if (language === "python") {
      await sandbox.writeFiles([
        { path: "/tmp/main.py", content: Buffer.from(code) },
      ]);
      const r = await sandbox.runCommand("python3", ["/tmp/main.py"]);
      return extractResult(r, "sandbox-persistent");
    }

    if (language === "cpp") {
      await ensureGpp(entry);
      await sandbox.writeFiles([
        { path: "/tmp/code.cpp", content: Buffer.from(code) },
      ]);
      const compile = await sandbox.runCommand("g++", [
        "-O2", "-std=c++17", "-o", "/tmp/prog", "/tmp/code.cpp",
      ]);
      const compileResult = await extractResult(compile, "sandbox-persistent");
      if (compileResult.code !== 0) return compileResult;

      const r = await sandbox.runCommand("/tmp/prog", []);
      return extractResult(r, "sandbox-persistent");
    }

    throw new Error(`Unsupported language: ${language}`);
  };

  try {
    let entry = await getOrCreateSandbox(roomId);
    try {
      return await run(entry);
    } catch (err) {
      console.error(`[execute] Persistent sandbox command failed, recreating:`, err);
      entry.sandbox.stop().catch(() => {});
      sandboxPool.delete(roomId);
      entry = await getOrCreateSandbox(roomId);
      return await run(entry);
    }
  } catch (err) {
    console.error(`[execute] Persistent sandbox error:`, err);
    sandboxPool.delete(roomId);
    return null;
  }
}

// =============================================================================
// Ephemeral Vercel Sandbox execution (original, no roomId)
// =============================================================================

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
        return extractResult(result, "sandbox");
      }

      if (language === "python") {
        const result = await sandbox.runCommand("python3", ["-c", code]);
        return extractResult(result, "sandbox");
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
        return extractResult(result, "sandbox");
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

// =============================================================================
// Docker execution (local dev)
// =============================================================================

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

// =============================================================================
// Judge0 CE API (free fallback)
// =============================================================================

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

// =============================================================================
// Local execution (dev only)
// =============================================================================

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

// =============================================================================
// Route handler
// =============================================================================

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language = "python", roomId, cell } = body;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "No code provided" },
        { status: 400 },
      );
    }

    // Persistent sandbox when roomId is provided (Vercel production)
    if (roomId && IS_VERCEL) {
      const result = await executePersistent(roomId, code, language, !!cell);
      if (result) return NextResponse.json(result);
    }

    // 1. Docker (local dev with Docker running)
    const dockerResult =
      language === "cpp"
        ? await executeDockerCpp(code)
        : language === "shell"
          ? null
          : await executeDockerPython(code);
    if (dockerResult) return NextResponse.json(dockerResult);

    // 2. Vercel Sandbox (production, ephemeral fallback)
    if (IS_VERCEL) {
      const sandboxResult = await executeSandbox(code, language);
      if (sandboxResult) return NextResponse.json(sandboxResult);
    }

    // 3. Judge0 CE API (free public fallback)
    if (language !== "shell") {
      const judge0Result = await executeJudge0(code, language);
      if (judge0Result) return NextResponse.json(judge0Result);
    }

    // 4. Local execution (dev only, needs python3/g++ installed)
    if (!IS_VERCEL && language !== "shell") {
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
