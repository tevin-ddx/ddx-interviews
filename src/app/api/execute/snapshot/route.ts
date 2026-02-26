import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST() {
  try {
    const { Sandbox } = await import("@vercel/sandbox");

    const sandbox = await Sandbox.create({
      runtime: "python3.13",
      timeout: 300_000,
    });

    const i1 = await sandbox.runCommand("pip", [
      "install", "--quiet", "pandas", "numpy", "matplotlib",
    ]);
    const e1 = await i1.stderr();
    if (e1) console.log("pip install output:", e1);

    const i2 = await sandbox.runCommand("pip", [
      "install", "--quiet", "torch",
      "--extra-index-url", "https://download.pytorch.org/whl/cpu",
    ]);
    const e2 = await i2.stderr();
    if (e2) console.log("torch install output:", e2);

    const verify = await sandbox.runCommand("python3", [
      "-c",
      "import pandas, numpy, torch, matplotlib; print(f'pandas={pandas.__version__} numpy={numpy.__version__} torch={torch.__version__} matplotlib={matplotlib.__version__}')",
    ]);
    const versions = await verify.stdout();

    const snapshot = await sandbox.snapshot({ expiration: 0 });

    return NextResponse.json({
      snapshotId: snapshot.snapshotId,
      versions: versions?.trim(),
    });
  } catch (err) {
    console.error("Snapshot creation failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
