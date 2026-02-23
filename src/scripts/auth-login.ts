/**
 * Interactive login: opens a persistent browser (like a real Chrome profile).
 * Log in manually, then close the browser. The session persists for future runs.
 *
 * Usage:
 *   npx tsx src/scripts/auth-login.ts              # opens LinkedIn by default
 *   npx tsx src/scripts/auth-login.ts linkedin
 *   npx tsx src/scripts/auth-login.ts indeed
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const PROFILE_DIR = join(process.cwd(), "input", "auth", "browser-profile");

const SITE_URLS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/login",
  indeed: "https://secure.indeed.com/settings/account",
};

async function login(site: string): Promise<void> {
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });

  const url = SITE_URLS[site];
  if (!url) {
    console.error(`Unknown site: ${site}. Available: ${Object.keys(SITE_URLS).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nOpening browser for ${site.toUpperCase()} login...`);
  console.log(`Profile stored at: ${PROFILE_DIR}`);
  console.log(`\n  1. Log in manually in the browser window`);
  console.log(`  2. Complete any 2FA / CAPTCHA challenges`);
  console.log(`  3. Once you're logged in, close the browser window\n`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  console.log(`\nSession saved. Future runs will use this browser profile.`);
}

const site = process.argv[2]?.toLowerCase() || "linkedin";
login(site).catch((e) => {
  console.error(e);
  process.exit(1);
});
