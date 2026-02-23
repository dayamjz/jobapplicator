/**
 * Greenhouse job search.
 * Greenhouse is often per-company; we support a list of board URLs in config or a single search URL.
 */
import { chromium } from "playwright";
import type { Job } from "../../types.js";
import type { SearchConfig } from "../../types.js";
import type { SiteSearchResult } from "../types.js";
import { delaySearchResultClick } from "../../utils/delay.js";
import type { DelayConfig } from "../../types.js";

export function buildSearchUrl(search: SearchConfig, _location: string): string {
  const params = search.urlParams?.greenhouse ?? {};
  const base = "https://boards.greenhouse.io/embed/job_board";
  const q = new URLSearchParams(params);
  q.set("for", search.keywords);
  return `${base}?${q.toString()}`;
}

export async function searchGreenhouse(
  search: SearchConfig,
  searchId: string,
  delayConfig: DelayConfig,
  maxJobs: number,
  _location: string
): Promise<SiteSearchResult> {
  const browser = await chromium.launch({ headless: true });
  const jobs: Job[] = [];
  try {
    const page = await browser.newPage();
    const url = buildSearchUrl(search);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delaySearchResultClick(delayConfig);

    const cards = await page.$$(".opening");
    for (let i = 0; i < Math.min(cards.length, maxJobs); i++) {
      const card = cards[i];
      let title = "";
      let company = "Greenhouse";
      let href = "";
      try {
        const linkEl = await card.$("a");
        title = linkEl ? await linkEl.textContent() ?? "" : "";
        href = linkEl ? (await linkEl.getAttribute("href")) ?? "" : "";
      } catch {
        //
      }
      if (title && href) {
        const jobId = href.match(/\/jobs\/(\d+)/)?.[1] ? `greenhouse-${href.match(/\/jobs\/(\d+)/)![1]}` : `greenhouse-${Date.now()}-${i}`;
        jobs.push({
          site: "greenhouse",
          jobId,
          idSource: "site_prefixed",
          title: title.trim(),
          company: company.trim(),
          url: href.startsWith("http") ? href : `https:${href}`,
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
