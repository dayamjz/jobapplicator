/**
 * LinkedIn job search via Playwright.
 * Builds search URL from keywords, location, urlParams (e.g. f_TPR for newest).
 */
import { chromium } from "playwright";
import type { Job, Site } from "../../types.js";
import type { SearchConfig } from "../../types.js";
import type { SiteSearchResult } from "../types.js";
import { delaySearchResultClick } from "../../utils/delay.js";
import type { DelayConfig } from "../../types.js";

const BASE = "https://www.linkedin.com/jobs/search/";

export function buildSearchUrl(search: SearchConfig): string {
  const params = new URLSearchParams();
  params.set("keywords", search.keywords);
  params.set("location", search.location);
  const linkedinParams = search.urlParams?.linkedin ?? {};
  for (const [k, v] of Object.entries(linkedinParams)) {
    params.set(k, v);
  }
  return `${BASE}?${params.toString()}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function searchLinkedIn(
  search: SearchConfig,
  searchId: string,
  delayConfig: DelayConfig,
  maxJobs: number
): Promise<SiteSearchResult> {
  const browser = await chromium.launch({ headless: true });
  const jobs: Job[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(buildSearchUrl(search), { waitUntil: "domcontentloaded" });
    await delaySearchResultClick(delayConfig);

    const cards = await page.$$('[data-job-id]');
    for (let i = 0; i < Math.min(cards.length, maxJobs); i++) {
      const card = cards[i];
      const jobIdAttr = await card.getAttribute("data-job-id");
      const jobId = jobIdAttr ? `linkedin-${jobIdAttr}` : `linkedin-${Date.now()}-${i}`;
      let title = "";
      let company = "";
      let url = "";
      try {
        const titleEl = await card.$(".job-search-card-list__title");
        title = (await titleEl?.textContent()) ?? "";
        const companyEl = await card.$(".job-search-card-list__subtitle-link");
        company = (await companyEl?.textContent()) ?? "";
        const linkEl = await card.$("a.job-search-card-list__title-link");
        url = (await linkEl?.getAttribute("href")) ?? "";
      } catch {
        // skip if selector fails
      }
      if (title && url) {
        jobs.push({
          site: "linkedin",
          jobId,
          idSource: "site_prefixed",
          title: title.trim(),
          company: company.trim(),
          url: url.startsWith("http") ? url : `https://www.linkedin.com${url}`,
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
