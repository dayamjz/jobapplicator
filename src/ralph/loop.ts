/**
 * Ralph-style loop per site: search -> generate -> write job folder -> open PR per job.
 * verifyCompletion: all jobs processed for each location/site pass.
 * Resume structure is extracted once at startup and reused for all jobs.
 */
import type { BrowserContext } from "playwright";
import type { Site, Job, RunConfig } from "../types.js";
import { getLocations } from "../types.js";
import { loadConfig } from "../config/index.js";
import { addOpenedPr, isInAppliedList, isInOpenedPrs } from "../state/memory.js";
import { generateForJob } from "../generation/generate.js";
import type { PrebuiltPrompts } from "../generation/generate.js";
import { extractResumeStructure } from "../generation/docx.js";
import type { ResumeStructure } from "../generation/docx.js";
import { searchLinkedIn, launchLinkedInContext } from "../sites/linkedin/search.js";
import type { SiteSearchResult } from "../sites/types.js";
import { openPrForJob } from "../state/github.js";
import { migrateJobsToCompanyTitleLayout } from "../utils/job-path.js";

interface SharedBrowsers {
  linkedInContext: BrowserContext;
}

const TARGET_EASY_JOBS_PER_RUN = 10;
const MAX_CARDS_TO_SCAN_PER_LOCATION = 200;

export async function runSiteLoop(
  site: Site,
  searchId: string,
  search: RunConfig["searches"][0],
  location: string,
  remainingTarget: number,
  resumeStructure?: ResumeStructure,
  prebuiltPrompts?: PrebuiltPrompts,
  browsers?: SharedBrowsers
): Promise<{ processed: number; considered: number; stoppedReason: string }> {
  if (remainingTarget <= 0) {
    return { processed: 0, considered: 0, stoppedReason: "cap_reached" };
  }
  const config = loadConfig();
  // Scan broadly per location; stop globally when target easy jobs is reached.
  const maxJobs = MAX_CARDS_TO_SCAN_PER_LOCATION;
  let searchResult: SiteSearchResult;
  switch (site) {
    case "linkedin":
      searchResult = await searchLinkedIn(search, searchId, config.delays, maxJobs, location, browsers?.linkedInContext);
      break;
    default:
      return { processed: 0, considered: 0, stoppedReason: "unknown_site" };
  }
  const considered = searchResult.considered ?? searchResult.jobs.length;

  let processed = 0;
  for (const job of searchResult.jobs) {
    if (processed >= remainingTarget) {
      return { processed, considered, stoppedReason: "cap_reached" };
    }
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
    considered,
    stoppedReason: processed >= remainingTarget ? "cap_reached" : "no_more_jobs",
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
  const browsers: SharedBrowsers = { linkedInContext };
  let processedThisRun = 0;
  let consideredThisRun = 0;

  try {
    for (const search of config.searches) {
      if (processedThisRun >= TARGET_EASY_JOBS_PER_RUN) break;
      const locations = getLocations(search);
      for (const location of locations) {
        if (processedThisRun >= TARGET_EASY_JOBS_PER_RUN) break;
        for (const site of ["linkedin"] as Site[]) {
          const remainingTarget = TARGET_EASY_JOBS_PER_RUN - processedThisRun;
          const result = await runSiteLoop(
            site,
            search.id,
            search,
            location,
            remainingTarget,
            resumeStructure,
            prebuiltPrompts,
            browsers
          );
          processedThisRun += result.processed;
          consideredThisRun += result.considered;
          console.log(`[${site}] ${search.id} (${location}): processed ${result.processed}, considered ${result.considered}, reason: ${result.stoppedReason}`);
          if (processedThisRun >= TARGET_EASY_JOBS_PER_RUN) {
            console.log(`Reached per-run Easy Apply target: ${processedThisRun}/${TARGET_EASY_JOBS_PER_RUN} jobs (considered ${consideredThisRun}).`);
            break;
          }
        }
      }
    }
  } finally {
    await linkedInContext.close();
  }
}
