/**
 * Interactive login script: opens a visible browser for each site,
 * waits for you to log in, then saves the session to input/auth/<site>.json.
 *
 * Usage:
 *   npx tsx src/scripts/auth-login.ts              # all sites
 *   npx tsx src/scripts/auth-login.ts linkedin      # linkedin only
 *   npx tsx src/scripts/auth-login.ts indeed        # indeed only
 *   npx tsx src/scripts/auth-login.ts greenhouse    # greenhouse only
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { Site } from "../types.js";

const AUTH_DIR = join(process.cwd(), "input", "auth");

const SITE_LOGIN_URLS: Record<Site, string> = {
  linkedin: "https://www.linkedin.com/login",
  indeed: "https://secure.indeed.com/auth",
  greenhouse: "https://app.greenhouse.io/users/sign_in",
};

const SITE_LOGGED_IN_INDICATORS: Record<Site, string> = {
  linkedin: "https://www.linkedin.com/feed",
  indeed: "https://www.indeed.com",
  greenhouse: "https://app.greenhouse.io/dashboard",
};

async function loginToSite(site: Site): Promise<void> {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

  const storagePath = join(AUTH_DIR, `${site}.json`);

  console.log(`\n=== ${site.toUpperCase()} ===`);
  console.log(`Opening browser... Log in manually.`);
  console.log(`Session will be saved to: ${storagePath}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(SITE_LOGIN_URLS[site], { waitUntil: "domcontentloaded" });

  console.log(`\nWaiting for you to log in...`);
  console.log(`(The browser will stay open until you're on the main page or press Enter in the terminal)\n`);

  // Wait until the URL changes away from the login page, or up to 5 minutes
  try {
    await page.waitForURL((url) => {
      const urlStr = url.toString();
      return !urlStr.includes("login") && !urlStr.includes("sign_in") && !urlStr.includes("/auth");
    }, { timeout: 300_000 });
    // Give the page a moment to fully load and set all cookies
    await page.waitForTimeout(3000);
  } catch {
    console.log("Timeout waiting for redirect. Saving session as-is...");
  }

  const storage = await context.storageState();
  const { writeFileSync } = await import("fs");
  writeFileSync(storagePath, JSON.stringify(storage, null, 2));
  console.log(`Session saved to ${storagePath}`);

  await browser.close();
}

async function main() {
  const arg = process.argv[2]?.toLowerCase();
  const allSites: Site[] = ["linkedin", "indeed", "greenhouse"];

  const sites: Site[] = arg && allSites.includes(arg as Site)
    ? [arg as Site]
    : allSites;

  console.log("=== Interactive Auth Login ===");
  console.log(`Sites to log into: ${sites.join(", ")}`);
  console.log("A browser window will open for each site.");
  console.log("Log in manually, and the session will be saved.\n");

  for (const site of sites) {
    await loginToSite(site);
  }

  console.log("\nAll done! Sessions saved to input/auth/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
