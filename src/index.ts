/**
 * Job Applicator - LinkedIn, Indeed & Greenhouse
 * Entry point: run search/generate/PR or apply based on CLI.
 */
import "dotenv/config";

async function main() {
  const cmd = process.argv[2] ?? "help";
  switch (cmd) {
    case "search":
      const { runSearch } = await import("./cli/search.js");
      await runSearch();
      break;
    case "apply":
      const { runApply } = await import("./cli/apply.js");
      await runApply();
      break;
    default:
      console.log(`
Job Applicator - LinkedIn, Indeed & Greenhouse

Usage:
  npm run dev -- search    Run search → generate → open PRs (cap 30 per site per 4h)
  npm run dev -- apply     Run timed apply for merged jobs (scheduled)
  npm run init-inputs      Create input/ with sample files

Env: see .env.example (OPENAI_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN)
Config: config.json (see config.example.json)
      `);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
