/**
 * CLI: run search -> generate -> open PRs (Ralph loop per site).
 */
import { runAllSites } from "../ralph/loop.js";

export async function runSearch(): Promise<void> {
  await runAllSites();
}
