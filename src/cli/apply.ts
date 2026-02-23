/**
 * CLI: run timed apply loop (approved jobs on default branch).
 */
import "dotenv/config";
import { runApplyLoop } from "../apply/runner.js";

export async function runApply(): Promise<void> {
  await runApplyLoop();
}

runApply().catch((err) => {
  console.error("Apply failed:", err);
  process.exit(1);
});
