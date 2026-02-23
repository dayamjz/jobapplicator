/**
 * Ralph-style loop per site: search -> generate -> write job folder -> open PR per job.
 * verifyCompletion: all jobs processed for each location/site pass.
 * Resume structure is extracted once at startup and reused for all jobs.
 */
import { chromium } from "playwright";
import type { BrowserContext, Browser } from "playwright";
import type { Site, Job, RunConfig } from "../types.js";
import { getLocations } from "../types.js";
import { loadConfig } from "../config/index.js";
import { addOpenedPr, isInAppliedList, isInOpenedPrs } from "../state/memory.js";
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
  // Cap intentionally disabled: fetch a broad slice per pass.
  const maxJobs = 200;
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
    if (isInAppliedList(site, job.jobId)) continue;

    await generateForJob(job, config.resumePath, config, resumeStructure, prebuiltPrompts);
    await openPrForJob(job);
    // Keep memory for visibility, but do not use it to suppress future matching.
    if (!isInOpenedPrs(site, job.jobId)) {
      addOpenedPr(site, job.jobId);
    }
    processed++;
  }

  return {
    processed,
    stoppedReason: "no_more_jobs",
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
