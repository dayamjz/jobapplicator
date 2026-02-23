/**
 * Indeed job search via Playwright.
 */
import { chromium } from "playwright";
import type { Job } from "../../types.js";
import type { SearchConfig } from "../../types.js";
import type { SiteSearchResult } from "../types.js";
import { delaySearchResultClick } from "../../utils/delay.js";
import type { DelayConfig } from "../../types.js";

export function buildSearchUrl(search: SearchConfig, location: string): string {
  const q = encodeURIComponent(search.keywords);
  const l = encodeURIComponent(location);
  return `https://www.indeed.com/jobs?q=${q}&l=${l}`;
}

export async function searchIndeed(
  search: SearchConfig,
  searchId: string,
  delayConfig: DelayConfig,
  maxJobs: number,
  location: string
): Promise<SiteSearchResult> {
  const browser = await chromium.launch({ headless: true });
  const jobs: Job[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(buildSearchUrl(search, location), { waitUntil: "domcontentloaded" });
    await delaySearchResultClick(delayConfig);

    const cards = await page.$$(".job_seen_beacon");
    for (let i = 0; i < Math.min(cards.length, maxJobs); i++) {
      const card = cards[i];
      let title = "";
      let company = "";
      let url = "";
      try {
        const titleEl = await card.$("h2.jobTitle a");
        title = (await titleEl?.textContent()) ?? "";
        url = (await titleEl?.getAttribute("href")) ?? "";
        const companyEl = await card.$('[data-testid="company-name"]');
        company = (await companyEl?.textContent()) ?? "";
      } catch {
        //
      }
      if (title && url) {
        const jobId = url.match(/\/jk=([a-f0-9]+)/)?.[1] ? `indeed-${url.match(/\/jk=([a-f0-9]+)/)![1]}` : `indeed-${Date.now()}-${i}`;
        jobs.push({
          site: "indeed",
          jobId,
          idSource: "site_prefixed",
          title: title.trim(),
          company: company.trim(),
          url: url.startsWith("http") ? url : `https://www.indeed.com${url}`,
          searchId,
          role: title.trim(),
        });
      }
      await delaySearchResultClick(delayConfig);
    }

    return { jobs, hasMore: cards.length >= maxJobs };
  } finally {
    await browser.close();
  }
}
