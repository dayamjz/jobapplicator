/**
 * Ralph-style loop per site: search -> generate -> write job folder -> open PR per job.
 * verifyCompletion: all jobs processed or cap (30 per site per 4h) reached.
 */
import type { Site, Job, RunConfig } from "../types.js";
import { getLocations } from "../types.js";
import { loadConfig } from "../config/index.js";
import { loadAppliedJobs, loadOpenedPrs, canOpenMorePrs, addOpenedPr } from "../state/memory.js";
import { generateForJob } from "../generation/generate.js";
import { searchLinkedIn } from "../sites/linkedin/search.js";
import { searchIndeed } from "../sites/indeed/search.js";
import { searchGreenhouse } from "../sites/greenhouse/search.js";
import { WINDOW_MS } from "../state/memory.js";
import { openPrForJob } from "../state/github.js";

export async function runSiteLoop(site: Site, searchId: string, search: RunConfig["searches"][0], location: string): Promise<{ processed: number; stoppedReason: string }> {
  const config = loadConfig();
  const applied = loadAppliedJobs();
  const maxPrs = config.maxPrsPerSitePerWindow;
  const windowMs = config.rateLimitWindowHours * 60 * 60 * 1000;

  if (!canOpenMorePrs(site, maxPrs, windowMs)) {
    return { processed: 0, stoppedReason: "rate_limit_4h" };
  }

  const maxJobs = Math.min(30, maxPrs - 0);
  let searchResult: { jobs: Job[] };
  switch (site) {
    case "linkedin":
      searchResult = await searchLinkedIn(search, searchId, config.delays, maxJobs, location);
      break;
    case "indeed":
      searchResult = await searchIndeed(search, searchId, config.delays, maxJobs, location);
      break;
    case "greenhouse":
      searchResult = await searchGreenhouse(search, searchId, config.delays, maxJobs, location);
      break;
    default:
      return { processed: 0, stoppedReason: "unknown_site" };
  }

  const openedPrs = loadOpenedPrs();
  let processed = 0;
  for (const job of searchResult.jobs) {
    if (!canOpenMorePrs(site, maxPrs, windowMs)) break;
    if (applied.some((e) => e.site === site && e.jobId === job.jobId)) continue;
    if (openedPrs.some((e) => e.site === site && e.jobId === job.jobId)) continue;

    await generateForJob(job, config.resumePath, config);
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
  const config = loadConfig();
  for (const search of config.searches) {
    const locations = getLocations(search);
    for (const location of locations) {
      for (const site of ["linkedin", "indeed", "greenhouse"] as Site[]) {
        const result = await runSiteLoop(site, search.id, search, location);
        console.log(`[${site}] ${search.id} (${location}): processed ${result.processed}, reason: ${result.stoppedReason}`);
      }
    }
  }
}
