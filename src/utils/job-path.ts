import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { slugify } from "./slugify.js";
import type { Job } from "../types.js";

export function getJobPathFromParts(company: string, title: string, jobId: string): string {
  return join(process.cwd(), "jobs", slugify(company), slugify(title), jobId);
}

export function getJobPathFromJob(job: Pick<Job, "company" | "title" | "jobId">): string {
  return getJobPathFromParts(job.company, job.title, job.jobId);
}

function walkForMetaFiles(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkForMetaFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === "meta.json") out.push(full);
  }
}

/**
 * Migrates legacy job folders from:
 *   jobs/<title-slug>/<job-id>
 * to:
 *   jobs/<company-slug>/<title-slug>/<job-id>
 */
export function migrateJobsToCompanyTitleLayout(): { migrated: number; skipped: number } {
  const jobsRoot = join(process.cwd(), "jobs");
  if (!existsSync(jobsRoot)) return { migrated: 0, skipped: 0 };

  const metaFiles: string[] = [];
  walkForMetaFiles(jobsRoot, metaFiles);

  let migrated = 0;
  let skipped = 0;

  for (const metaPath of metaFiles) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
        company?: string;
        title?: string;
        jobId?: string;
        compensation?: string;
        pay?: string;
      };
      if (!meta.company || !meta.title || !meta.jobId) {
        skipped++;
        continue;
      }

      const currentJobDir = dirname(metaPath);
      const targetJobDir = getJobPathFromParts(meta.company, meta.title, meta.jobId);
      const normalizedComp = meta.compensation ?? meta.pay ?? "";
      const normalizedPay = meta.pay ?? meta.compensation ?? "";
      if (meta.compensation !== normalizedComp || meta.pay !== normalizedPay) {
        meta.compensation = normalizedComp;
        meta.pay = normalizedPay;
        writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      }

      if (currentJobDir === targetJobDir) continue;
      if (existsSync(targetJobDir)) continue;

      mkdirSync(dirname(targetJobDir), { recursive: true });
      renameSync(currentJobDir, targetJobDir);
      migrated++;
    } catch {
      skipped++;
    }
  }

  return { migrated, skipped };
}
