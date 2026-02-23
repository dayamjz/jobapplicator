/**
 * CLI: run search -> generate -> open PRs (Ralph loop per site).
 */
import "dotenv/config";
import { runAllSites } from "../ralph/loop.js";

export async function runSearch(): Promise<void> {
  await runAllSites();
}

runSearch().catch((err) => {
  console.error(err);
  process.exit(1);
});
