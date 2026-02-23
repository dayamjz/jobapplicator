/**
 * CLI: run timed apply loop (approved jobs on default branch).
 */
import "dotenv/config";
import { runApplyLoop } from "../apply/runner.js";

function parseJobIdFromArgs(argv: string[]): string | undefined {
  const idx = argv.findIndex((arg) => arg === "--jobId");
  if (idx >= 0) return argv[idx + 1];
  const inline = argv.find((arg) => arg.startsWith("--jobId="));
  if (inline) return inline.split("=")[1];
  return undefined;
}

export async function runApply(): Promise<void> {
  const jobId = parseJobIdFromArgs(process.argv.slice(2));
  await runApplyLoop({ targetJobId: jobId });
}

runApply().catch((err) => {
  console.error("Apply failed:", err);
  process.exit(1);
});
