/**
 * GitHub: create branch, commit job folder, push, open PR (one per job).
 * Always returns to main branch after processing.
 */
import { existsSync } from "fs";
import { execSync } from "child_process";
import type { Job } from "../types.js";
import { slugify } from "../utils/slugify.js";
import { getJobPathFromJob } from "../utils/job-path.js";

function run(cmd: string): string {
  return execSync(cmd, { cwd: process.cwd(), encoding: "utf-8" });
}

function safeTitle(s: string): string {
  return s.replace(/["`$\\]/g, "");
}

function remoteBranchExists(branchName: string): boolean {
  try {
    const out = run(`git ls-remote --heads origin "${branchName}"`);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function openPrForJob(job: Job): Promise<void> {
  const roleSlug = slugify(job.role);
  const branchName = `application/${roleSlug}-${job.jobId}`;
  const jobPath = getJobPathFromJob(job);
  const repoRelativeJobPath = jobPath.replace(`${process.cwd()}/`, "");

  if (!existsSync(jobPath)) {
    throw new Error(`Job folder not found: ${jobPath}`);
  }

  // Avoid branch churn and non-fast-forward push failures on already-tracked jobs.
  if (remoteBranchExists(branchName)) {
    console.log(`  Remote branch already exists for ${branchName}; skipping PR branch update.`);
    return;
  }

  try {
    try {
      run(`git checkout -b "${branchName}"`);
    } catch {
      run(`git checkout "${branchName}"`);
    }
    run(`git add -f "${repoRelativeJobPath}/"`);
    run(`git commit -m "Application: ${safeTitle(job.title)} at ${safeTitle(job.company)}"`);
    try {
      run(`git push origin "${branchName}"`);
    } catch (err) {
      console.warn("  Push failed:", (err as Error).message);
    }

    const prTitle = `Application: ${safeTitle(job.title)} at ${safeTitle(job.company)}`;
    const prBody = `**Role:** ${job.title}\n**Company:** ${job.company}\n**URL:** ${job.url}\n**Site:** ${job.site}\n**Job ID:** ${job.jobId}`;
    try {
      const result = run(`gh pr create --title "${prTitle}" --body "${prBody.replace(/"/g, '\\"')}" --base main --head "${branchName}" 2>&1`);
      console.log(`  PR created: ${result.trim()}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already exists")) {
        console.log(`  PR already exists for ${branchName}`);
      } else {
        console.warn("  gh pr create failed (push-only mode):", msg.slice(0, 200));
        const repo = process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME
          ? `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
          : null;
        if (repo) {
          console.log(`  Manual PR: https://github.com/${repo}/compare/${branchName}?expand=1`);
        }
      }
    }
  } finally {
    try {
      run("git checkout main");
    } catch {
      console.warn("  Could not return to main branch");
    }
  }
}
