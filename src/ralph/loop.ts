/**
 * Ralph-style loop per site: search -> generate -> write job folder -> open PR per job.
 * verifyCompletion: all jobs processed or cap (30 per site per 4h) reached.
 * Resume structure is extracted once at startup and reused for all jobs.
 */
import { chromium } from "playwright";
import type { BrowserContext, Browser } from "playwright";
import type { Site, Job, RunConfig } from "../types.js";
import { getLocations } from "../types.js";
import { loadConfig } from "../config/index.js";
import { canOpenMorePrs, addOpenedPr, countOpenedPrsInWindow, isInAppliedList, isInOpenedPrs } from "../state/memory.js";
import { generateForJob } from "../generation/generate.js";
import type { PrebuiltPrompts } from "../generation/generate.js";
import { extractResumeStructure } from "../generation/docx.js";
import type { ResumeStructure } from "../generation/docx.js";
import { searchLinkedIn, launchLinkedInContext } from "../sites/linkedin/search.js";
import { searchIndeed } from "../sites/indeed/search.js";
import { searchGreenhouse } from "../sites/greenhouse/search.js";
import { openPrForJob } from "../state/github.js";
import { migrateJobsToCompanyTitleLayout } from "../utils/job-path.js";

interface SharedBrowsers {
  linkedInContext: BrowserContext;
  generalBrowser: Browser;
}

export async function runSiteLoop(
  site: Site,
  searchId: string,
  search: RunConfig["searches"][0],
  location: string,
  resumeStructure?: ResumeStructure,
  prebuiltPrompts?: PrebuiltPrompts,
  browsers?: SharedBrowsers
): Promise<{ processed: number; stoppedReason: string }> {
  const config = loadConfig();
  const maxPrs = config.maxPrsPerSitePerWindow;
  const windowMs = config.rateLimitWindowHours * 60 * 60 * 1000;

  if (!canOpenMorePrs(site, maxPrs, windowMs)) {
    return { processed: 0, stoppedReason: "rate_limit_4h" };
  }

  const openedInWindow = countOpenedPrsInWindow(site, windowMs);
  const maxJobs = Math.min(30, maxPrs - openedInWindow);
  let searchResult: { jobs: Job[] };
  switch (site) {
    case "linkedin":
      searchResult = await searchLinkedIn(search, searchId, config.delays, maxJobs, location, browsers?.linkedInContext);
      break;
    case "indeed":
      searchResult = await searchIndeed(search, searchId, config.delays, maxJobs, location, browsers?.generalBrowser);
      break;
    case "greenhouse":
      searchResult = await searchGreenhouse(search, searchId, config.delays, maxJobs, location, browsers?.generalBrowser);
      break;
    default:
      return { processed: 0, stoppedReason: "unknown_site" };
  }

  let processed = 0;
  for (const job of searchResult.jobs) {
    if (!canOpenMorePrs(site, maxPrs, windowMs)) break;
    if (isInAppliedList(site, job.jobId)) continue;
    if (isInOpenedPrs(site, job.jobId)) continue;

    await generateForJob(job, config.resumePath, config, resumeStructure, prebuiltPrompts);
    await openPrForJob(job);
    addOpenedPr(site, job.jobId);
    processed++;
  }

  return {
    processed,
    stoppedReason: processed >= maxJobs ? "cap_reached" : "no_more_jobs",
  };
}

export async function runAllSites(): Promise<void> {
  const { migrated } = migrateJobsToCompanyTitleLayout();
  if (migrated > 0) {
    console.log(`Migrated ${migrated} job folder(s) to jobs/<company>/<title>/<id> layout.`);
  }

  const config = loadConfig();
  console.log("Extracting resume structure (cached for all jobs)...");
  const resumeStructure = await extractResumeStructure(config.resumePath);
  console.log(`Resume: ${resumeStructure.rawText.length} chars, ${resumeStructure.headings.length} sections`);

  const { buildPrebuiltPrompts } = await import("../generation/generate.js");
  const prebuiltPrompts = buildPrebuiltPrompts(resumeStructure);

  const linkedInContext = await launchLinkedInContext();
  const generalBrowser = await chromium.launch({ headless: true });
  const browsers: SharedBrowsers = { linkedInContext, generalBrowser };

  try {
    for (const search of config.searches) {
      const locations = getLocations(search);
      for (const location of locations) {
        for (const site of ["linkedin", "indeed", "greenhouse"] as Site[]) {
          const result = await runSiteLoop(site, search.id, search, location, resumeStructure, prebuiltPrompts, browsers);
          console.log(`[${site}] ${search.id} (${location}): processed ${result.processed}, reason: ${result.stoppedReason}`);
        }
      }
    }
  } finally {
    await linkedInContext.close();
    await generalBrowser.close();
  }
}
