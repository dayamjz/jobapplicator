/**
 * CLI: run timed apply loop (approved jobs on default branch).
 */
import { runApplyLoop } from "../apply/runner.js";

export async function runApply(): Promise<void> {
  await runApplyLoop();
}
