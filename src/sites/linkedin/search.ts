/**
 * LinkedIn job search via Playwright.
 * Builds search URL from keywords, location, urlParams (e.g. f_TPR for newest).
 * Fetches job descriptions by visiting each job's detail page.
 */
import { chromium } from "playwright";
import type { Job, Site } from "../../types.js";
import type { SearchConfig } from "../../types.js";
import type { SiteSearchResult } from "../types.js";
import { delaySearchResultClick } from "../../utils/delay.js";
import type { DelayConfig } from "../../types.js";
import { getAuthStatePath } from "../../utils/auth.js";

const BASE = "https://www.linkedin.com/jobs/search/";

export function buildSearchUrl(search: SearchConfig, location: string): string {
  const params = new URLSearchParams();
  params.set("keywords", search.keywords);
  params.set("location", location);
  const linkedinParams = search.urlParams?.linkedin ?? {};
  for (const [k, v] of Object.entries(linkedinParams)) {
    params.set(k, v);
  }
  return `${BASE}?${params.toString()}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function fetchJobDescription(context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>>, url: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);
    const descEl = await page.$(".show-more-less-html__markup") ?? await page.$(".description__text");
    if (descEl) {
      return ((await descEl.textContent()) ?? "").trim();
    }
    return "";
  } catch {
    return "";
  } finally {
    await page.close();
  }
}

export async function searchLinkedIn(
  search: SearchConfig,
  searchId: string,
  delayConfig: DelayConfig,
  maxJobs: number,
  location: string
): Promise<SiteSearchResult> {
  const authState = getAuthStatePath("linkedin");
  const browser = await chromium.launch({ headless: true });
  const context = authState
    ? await browser.newContext({ storageState: authState })
    : await browser.newContext();
  const jobs: Job[] = [];
  try {
    const page = await context.newPage();
    console.log(`  [linkedin] Auth: ${authState ? "using saved session" : "anonymous (public search)"}`);
    console.log(`  [linkedin] Searching: ${buildSearchUrl(search, location)}`);
    await page.goto(buildSearchUrl(search, location), { waitUntil: "domcontentloaded" });
    await delaySearchResultClick(delayConfig);

    const cards = await page.$$('.base-search-card');
    console.log(`  [linkedin] Found ${cards.length} cards on search page`);
    for (let i = 0; i < Math.min(cards.length, maxJobs); i++) {
      const card = cards[i];
      const urn = await card.getAttribute("data-entity-urn");
      const urnId = urn?.match(/jobPosting:(\d+)/)?.[1];
      const jobId = urnId ? `linkedin-${urnId}` : `linkedin-${Date.now()}-${i}`;
      let title = "";
      let company = "";
      let url = "";
      try {
        const titleEl = await card.$(".base-search-card__title");
        title = (await titleEl?.textContent()) ?? "";
        const companyEl = await card.$(".base-search-card__subtitle a");
        company = (await companyEl?.textContent()) ?? "";
        const linkEl = await card.$("a.base-card__full-link");
        url = (await linkEl?.getAttribute("href")) ?? "";
      } catch {
        // skip if selector fails
      }
      if (title && url) {
        const fullUrl = url.startsWith("http") ? url : `https://www.linkedin.com${url}`;
        console.log(`  [linkedin] Fetching description for: ${title.trim()} at ${company.trim()}`);
        const description = await fetchJobDescription(context, fullUrl);
        console.log(`  [linkedin] Description length: ${description.length} chars`);
        jobs.push({
          site: "linkedin",
          jobId,
          idSource: "site_prefixed",
          title: title.trim(),
          company: company.trim(),
          url: fullUrl,
          description,
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
