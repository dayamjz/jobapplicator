/**
 * GitHub: create branch, commit job folder, push, open PR (one per job).
 */
import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { Job } from "../types.js";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function run(cmd: string): void {
  execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
}

export async function openPrForJob(job: Job): Promise<void> {
  const roleSlug = slugify(job.role);
  const branchName = `application/${roleSlug}-${job.jobId}`;
  const jobPath = join(process.cwd(), "jobs", roleSlug, job.jobId);

  if (!existsSync(jobPath)) {
    throw new Error(`Job folder not found: ${jobPath}`);
  }

  try {
    run(`git checkout -b ${branchName}`);
  } catch {
    run(`git checkout ${branchName}`);
  }
  run(`git add jobs/${roleSlug}/${job.jobId}/`);
  run(`git commit -m "Application: ${job.title} at ${job.company}"`);
  try {
    run(`git push origin ${branchName}`);
  } catch (err) {
    console.warn("Push failed (run with GITHUB_TOKEN and remote configured):", (err as Error).message);
  }

  const repo = process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME
    ? `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
    : null;
  if (repo) {
    console.log(`Open PR: https://github.com/${repo}/compare/${branchName}?expand=1`);
    console.log(`  Title: Application: ${job.title} at ${job.company}`);
  }
}
