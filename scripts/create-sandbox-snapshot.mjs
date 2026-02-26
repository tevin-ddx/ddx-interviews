import { config } from "dotenv";
config({ path: ".env.local" });
import { Sandbox } from "@vercel/sandbox";

async function main() {
  console.log("Creating sandbox with python3.13 runtime...");
  const sandbox = await Sandbox.create({
    runtime: "python3.13",
    timeout: 300_000,
  });
  console.log(`Sandbox created: ${sandbox.sandboxId}`);

  console.log("Installing pandas, numpy...");
  const install1 = await sandbox.runCommand("pip", [
    "install", "--quiet", "pandas", "numpy",
  ]);
  console.log("pip install pandas numpy exit:", install1.exitCode);
  const err1 = await install1.stderr();
  if (err1) console.log(err1);

  console.log("Installing torch (CPU)...");
  const install = await sandbox.runCommand("pip", [
    "install", "--quiet", "torch",
    "--extra-index-url", "https://download.pytorch.org/whl/cpu",
  ]);
  console.log("Install exit code:", install.exitCode);
  const stderr = await install.stderr();
  if (stderr) console.log("Install output:", stderr);

  console.log("Verifying installs...");
  const verify = await sandbox.runCommand("python3", [
    "-c",
    "import pandas; import numpy; import torch; print(f'pandas={pandas.__version__} numpy={numpy.__version__} torch={torch.__version__}')",
  ]);
  console.log(await verify.stdout());

  console.log("Creating snapshot (this stops the sandbox)...");
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(`\nSnapshot created successfully!`);
  console.log(`Snapshot ID: ${snapshot.snapshotId}`);
  console.log(`\nAdd this to your Vercel environment variables:`);
  console.log(`  SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
