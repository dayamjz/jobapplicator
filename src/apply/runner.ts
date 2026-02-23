/**
 * Apply loop: find approved jobs, submit via Playwright using site-specific and ATS-specific handlers.
 * Supports LinkedIn Easy Apply + external ATS, Indeed native + external ATS, and direct ATS links.
 * Uses profile.yaml for form data, converts resume.md to DOCX, and supports dry-run mode.
 *
 * Status transitions written to meta.json:
 *   pending_review -> approved  (auto on main, merged PR = approved)
 *   approved -> applied         (successful submission, dryRun=false)
 *   approved -> needs_manual    (login wall, CAPTCHA, or form filler failed)
 *   approved -> approved        (dryRun=true, status unchanged)
 *   Any failure logs error details into meta.json.lastError
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import { loadConfig } from "../config/index.js";
import {
  loadAppliedJobs,
  canApplyMore,
  addAppliedJob,
  WINDOW_MS,
} from "../state/memory.js";
import { delayPageLoad, delayBetweenApplications } from "../utils/delay.js";
import { loadProfile, loadQuestionTemplates } from "../utils/profile.js";
import { getResumeForUpload } from "../utils/resume-convert.js";
import { getBrowserProfileDir } from "../utils/auth.js";
import { migrateJobsToCompanyTitleLayout } from "../utils/job-path.js";
import { applyLinkedIn } from "../sites/linkedin/apply.js";
import { applyIndeed } from "../sites/indeed/apply.js";
import type { Site, AppliedJobEntry } from "../types.js";

const JOBS_DIR = "jobs";

function collectMetaPaths(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMetaPaths(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === "meta.json") {
      out.push(full);
    }
  }
}

export interface JobFolder {
  site: Site;
  jobId: string;
  role: string;
  company: string;
  url: string;
  path: string;
  status: string;
}

function updateMeta(metaPath: string, updates: Record<string, unknown>): void {
  if (!existsSync(metaPath)) return;
  const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  Object.assign(meta, updates);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

export function findApprovedJobs(): JobFolder[] {
  const jobsRoot = join(process.cwd(), JOBS_DIR);
  if (!existsSync(jobsRoot)) return [];

  const applied = loadAppliedJobs();
  const list: JobFolder[] = [];

  const metaPaths: string[] = [];
  collectMetaPaths(jobsRoot, metaPaths);
  for (const metaPath of metaPaths) {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    if (meta.status === "applied" || meta.status === "needs_manual") continue;

    if (meta.status === "pending_review") {
      meta.status = "approved";
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      console.log(`  Auto-approved (merged PR): ${meta.title} at ${meta.company}`);
    }

    if (meta.status !== "approved") continue;
    if (applied.some((e) => e.site === meta.site && e.jobId === meta.jobId)) continue;

    list.push({
      site: meta.site,
      jobId: meta.jobId,
      role: meta.title,
      company: meta.company,
      url: meta.URL,
      path: dirname(metaPath),
      status: meta.status,
    });
  }
  return list;
}

export async function runApplyForJob(
  folder: JobFolder,
  context: BrowserContext,
  browser: Browser,
): Promise<boolean> {
  const config = loadConfig();
  const profile = loadProfile();
  const templates = loadQuestionTemplates(folder.site);
  const dryRun = config.dryRun ?? false;
  const metaPath = join(folder.path, "meta.json");
  const now = new Date().toISOString();

  const resumePath = await getResumeForUpload(folder.path, config.resumePath).catch((err) => {
    const msg = (err as Error).message;
    console.warn(`  Resume error: ${msg}`);
    updateMeta(metaPath, {
      status: "needs_manual",
      lastError: { message: `Resume error: ${msg}`, at: now },
    });
    return "";
  });
  if (!resumePath) return false;

  const coverPath = join(folder.path, "cover.md");
  const coverText = existsSync(coverPath) ? readFileSync(coverPath, "utf-8") : "";

  console.log(`\nApplying: ${folder.role} at ${folder.company} [${folder.site}]`);
  console.log(`  URL: ${folder.url}`);
  console.log(`  Dry run: ${dryRun}`);

  const page = await context.newPage();
  let success = false;

  try {
    await delayPageLoad(config.delays);

    if (folder.site === "linkedin") {
      success = await applyLinkedIn({
        page,
        context,
        job: folder,
        profile,
        templates,
        resumePath,
        coverText,
        delays: config.delays,
        dryRun,
      });
    } else if (folder.site === "indeed") {
      success = await applyIndeed({
        page,
        context,
        job: folder,
        profile,
        templates,
        resumePath,
        coverText,
        delays: config.delays,
        dryRun,
      });
    } else {
      const msg = `Unsupported site for apply: ${folder.site}`;
      console.warn(`  ${msg}`);
      updateMeta(metaPath, {
        status: "needs_manual",
        lastError: { message: msg, at: now },
      });
      return false;
    }

    if (success && !dryRun) {
      const entry: AppliedJobEntry = {
        site: folder.site,
        jobId: folder.jobId,
        role: folder.role,
        company: folder.company,
        url: folder.url,
        appliedAt: now,
      };
      const applied = loadAppliedJobs();
      addAppliedJob(applied, entry);

      updateMeta(metaPath, {
        status: "applied",
        appliedAt: now,
        lastError: null,
      });
      console.log(`  Status: applied`);
    } else if (success && dryRun) {
      console.log(`  Status: approved (dry run, no change)`);
    } else {
      updateMeta(metaPath, {
        status: "needs_manual",
        lastError: { message: "Apply flow did not reach submission", at: now },
      });
      console.log(`  Status: needs_manual`);
    }

    return success;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`  Apply error: ${msg}`);
    updateMeta(metaPath, {
      status: "needs_manual",
      lastError: { message: msg, stack: (err as Error).stack?.split("\n").slice(0, 5).join("\n"), at: now },
    });
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function runApplyLoop(): Promise<void> {
  const { migrated } = migrateJobsToCompanyTitleLayout();
  if (migrated > 0) {
    console.log(`Migrated ${migrated} job folder(s) to jobs/<company>/<title>/<id> layout.`);
  }

  const config = loadConfig();
  const applied = loadAppliedJobs();
  const jobs = findApprovedJobs();

  if (jobs.length === 0) {
    console.log("No approved jobs to apply for.");
    return;
  }

  console.log(`Found ${jobs.length} approved jobs to apply for.`);
  console.log(`Dry run mode: ${config.dryRun ?? false}`);

  const bySite = new Map<Site, JobFolder[]>();
  for (const j of jobs) {
    if (!canApplyMore(applied, j.site, config.maxApplicationsPerSitePerWindow, WINDOW_MS)) continue;
    const list = bySite.get(j.site) ?? [];
    list.push(j);
    bySite.set(j.site, list);
  }

  const profileDir = getBrowserProfileDir();
  const context = profileDir
    ? await chromium.launchPersistentContext(profileDir, {
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
      })
    : await chromium.launchPersistentContext("", { headless: false });

  const browser = context.browser()!;

  try {
    let run = 0;
    for (const [site, list] of bySite) {
      const max = config.maxApplicationsPerSitePerWindow;
      const inWindow = applied.filter(
        (e) => e.site === site && new Date(e.appliedAt).getTime() >= Date.now() - WINDOW_MS
      ).length;
      const toRun = Math.min(list.length, max - inWindow);
      console.log(`\n--- ${site}: ${toRun} jobs to apply ---`);
      for (let i = 0; i < toRun; i++) {
        const ok = await runApplyForJob(list[i], context, browser);
        if (ok) run++;
        await delayBetweenApplications(config.delays);
      }
    }
    console.log(`\nApply loop finished. Applied: ${run} jobs.`);
  } finally {
    await context.close();
  }
}
