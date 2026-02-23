/**
 * LinkedIn apply handler: Easy Apply modal flow + external apply redirect routing.
 */
import type { Page, BrowserContext } from "playwright";
import type { ProfileAnswers, QuestionTemplate, DelayConfig } from "../../types.js";
import {
  fillDiversityQuestions,
  uploadFileToVisible,
  fillContactInfo,
  takeScreenshot,
} from "../../apply/form-filler.js";
import { matchFillAndFallback, logUnmatchedFields } from "../../apply/field-matcher.js";
import { detectATS } from "../../apply/ats-detector.js";
import { applyOnWorkday } from "../../apply/ats/workday.js";
import { applyOnLever } from "../../apply/ats/lever.js";
import { applyOnGreenhouse } from "../../apply/ats/greenhouse.js";
import { applyOnGeneric } from "../../apply/ats/generic.js";
import { delayFormField, delayPageLoad } from "../../utils/delay.js";
import type { JobFolder } from "../../apply/runner.js";

export interface LinkedInApplyOptions {
  page: Page;
  context: BrowserContext;
  job: JobFolder;
  profile: ProfileAnswers;
  templates: QuestionTemplate[];
  resumePath: string;
  coverText: string;
  delays: DelayConfig;
  dryRun: boolean;
}

async function findApplyButton(page: Page): Promise<"easy" | "external" | null> {
  const easyApplyLink = await page.$("a[aria-label*='Easy Apply']");
  if (easyApplyLink) return "easy";

  const cssBtn = await page.$("button[aria-label*='Easy Apply'], a[aria-label*='Easy Apply']");
  if (cssBtn) return "easy";

  const textBtn = page.locator("button, a", { hasText: /Easy Apply/i });
  if (await textBtn.count() > 0) return "easy";

  const externalLink = await page.$("a.jobs-apply-button--top-card, a[data-tracking-control-name*='apply'], a[aria-label*='Apply'], button.jobs-apply-button, a.jobs-apply-button");
  if (externalLink) {
    const aria = await externalLink.getAttribute("aria-label") ?? "";
    if (aria.toLowerCase().includes("easy")) return "easy";
    return "external";
  }

  const externalText = page.locator("a", { hasText: /Apply on company/i });
  if (await externalText.count() > 0) return "external";

  const externalButtonText = page.locator("button", { hasText: /Apply on company|Apply on company site|Apply externally/i });
  if (await externalButtonText.count() > 0) return "external";

  return null;
}

async function handleEasyApplyModal(opts: LinkedInApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;

  let applyBtn = await page.$("a[aria-label*='Easy Apply'], button[aria-label*='Easy Apply']");
  if (!applyBtn) {
    const loc = page.locator("button, a", { hasText: /Easy Apply/i }).first();
    if (await loc.count() > 0) applyBtn = await loc.elementHandle();
  }
  if (!applyBtn) return false;
  console.log(`  [linkedin] Found Easy Apply element: <${await applyBtn.evaluate(el => el.tagName)}> aria="${await applyBtn.getAttribute("aria-label")}"`);
  await applyBtn.click();
  await delayPageLoad(delays);

  const modal = await page.waitForSelector(".jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal]", { timeout: 5000 }).catch(() => null);
  if (!modal) {
    console.warn("  [linkedin] Easy Apply modal did not appear");
    return false;
  }

  // Discover the actual modal selector for scoping field extraction
  const modalInfo = await page.evaluate(() => {
    const candidates = [
      ".jobs-easy-apply-modal",
      ".jobs-easy-apply-content",
      ".artdeco-modal__content",
      "[data-test-modal]",
      ".artdeco-modal",
      "[role='dialog']",
    ];
    const found: string[] = [];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const inputs = el.querySelectorAll("input, select, textarea");
        found.push(`${sel} (${inputs.length} form elements)`);
      }
    }
    // Also dump the dialog's inner structure
    const dialog = document.querySelector("[role='dialog']");
    let dialogSnippet = "";
    if (dialog) {
      const allInputs = dialog.querySelectorAll("input, select, textarea");
      dialogSnippet = Array.from(allInputs).map(el => {
        const inp = el as HTMLInputElement;
        return `<${inp.tagName} type="${inp.type}" name="${inp.name}" aria-label="${inp.getAttribute("aria-label")}" placeholder="${inp.placeholder}">`;
      }).join("\n      ");
    }
    return { found, dialogSnippet };
  });
  console.log("  [linkedin] Modal selectors found:", modalInfo.found);
  if (modalInfo.dialogSnippet) {
    console.log("  [linkedin] Dialog form elements:\n     ", modalInfo.dialogSnippet);
  }

  let step = 0;
  const MAX_STEPS = 10;

  while (step < MAX_STEPS) {
    step++;
    console.log(`  [linkedin] Easy Apply step ${step}`);

    // Always screenshot step 1 for debugging
    if (step === 1) {
      await takeScreenshot(page, job.path, "easy-apply-step-1-debug");
    }

    await uploadFileToVisible(page, resumePath);
    await fillContactInfo(page, profile, delays);

    // Use the broadest selector that actually contains form fields
    const modalScope = "[role='dialog']";
    const { unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun, modalScope);
    logUnmatchedFields(unmatched, page.url());

    const coverTextarea = await page.$("textarea[name*='cover'], textarea[aria-label*='cover letter'], textarea[aria-label*='Cover']");
    if (coverTextarea && coverText) {
      await coverTextarea.fill(coverText);
      await delayFormField(delays);
    }
    if (!coverTextarea) {
      const coverLoc = page.locator("textarea", { hasText: "" }).filter({ has: page.locator("xpath=ancestor::div[contains(., 'Cover')]") });
      const coverLabeled = page.locator("label:has-text('Cover letter') + textarea, label:has-text('Cover letter') ~ textarea");
      if (await coverLabeled.count() > 0 && coverText) {
        await coverLabeled.first().fill(coverText);
        await delayFormField(delays);
      }
    }

    await fillDiversityQuestions(page, profile, delays);

    if (dryRun) {
      await takeScreenshot(page, job.path, `easy-apply-step-${step}`);
    }

    // Dismiss any "discard application?" confirmation that appeared
    const discardDialog = page.locator("[data-test-modal-id='data-test-easy-apply-discard-confirmation'] button", { hasText: /discard/i });
    if (await discardDialog.count() > 0) {
      console.log("  [linkedin] Dismissing discard confirmation dialog");
      const keepBtn = page.locator("[data-test-modal-id='data-test-easy-apply-discard-confirmation'] button", { hasText: /continue/i });
      if (await keepBtn.count() > 0) {
        await keepBtn.first().click({ force: true }).catch(() => {});
      } else {
        await discardDialog.first().click({ force: true }).catch(() => {});
      }
      await delayFormField(delays);
    }

    const submitLoc = page.locator("button", { hasText: /Submit application/i });
    if (await submitLoc.count() > 0) {
      if (dryRun) {
        console.log("  [linkedin] Dry run: would click Submit application");
        await takeScreenshot(page, job.path, "easy-apply-submit");
        return true;
      }
      await submitLoc.first().click({ force: true });
      await delayPageLoad(delays);
      console.log("  [linkedin] Application submitted via Easy Apply");
      return true;
    }

    const submitBtn = await page.$("button[aria-label='Submit application'], button[aria-label='Submit']");
    if (submitBtn) {
      if (dryRun) {
        console.log("  [linkedin] Dry run: would click Submit");
        await takeScreenshot(page, job.path, "easy-apply-submit");
        return true;
      }
      await submitBtn.click({ force: true });
      await delayPageLoad(delays);
      console.log("  [linkedin] Application submitted via Easy Apply");
      return true;
    }

    await page.evaluate(() => {
      const modal = document.querySelector("[role='dialog'], [class*='modal'], [class*='artdeco-modal']");
      if (modal) modal.scrollTop = modal.scrollHeight;
    });
    await delayFormField(delays);

    let clicked = false;
    for (const label of ["Next", "Continue", "Review", "Review your application", "Continue to next step"]) {
      const loc = page.locator("button", { hasText: new RegExp(label, "i") });
      if (await loc.count() > 0) {
        console.log(`  [linkedin] Clicking "${label}" button`);
        await loc.first().click({ force: true }).catch(() => {});
        await delayPageLoad(delays);
        clicked = true;
        break;
      }
    }
    if (clicked) continue;

    const footerBtns = page.locator("footer button, [class*='footer'] button, [class*='action'] button");
    const footerCount = await footerBtns.count();
    if (footerCount > 0) {
      const lastBtn = footerBtns.last();
      const btnText = await lastBtn.textContent().catch(() => "");
      console.log(`  [linkedin] Footer button found: "${btnText?.trim()}"`);
      await lastBtn.click({ force: true }).catch(() => {});
      await delayPageLoad(delays);
      continue;
    }

    const nextBtn = await page.$("button[aria-label='Continue to next step'], button[aria-label='Next'], button[aria-label='Review']");
    if (nextBtn) {
      await nextBtn.click({ force: true }).catch(() => {});
      await delayPageLoad(delays);
      continue;
    }

    console.warn(`  [linkedin] No Next/Submit button found on step ${step}`);
    break;
  }

  console.warn("  [linkedin] Easy Apply flow ended without finding submit button");
  return false;
}

async function handleExternalApply(opts: LinkedInApplyOptions): Promise<boolean> {
  const { page, context, job, profile, templates, resumePath, coverText, delays, dryRun } = opts;

  let externalEl =
    await page.$("a.jobs-apply-button--top-card, a[data-tracking-control-name*='apply'], a.jobs-apply-button, a[aria-label*='Apply'], button[aria-label*='Apply']");

  if (!externalEl) {
    const candidateLocators = [
      page.locator("a", { hasText: /Apply on company|Apply on company site|Apply externally/i }).first(),
      page.locator("button", { hasText: /Apply on company|Apply on company site|Apply externally/i }).first(),
      page.locator("a.jobs-apply-button").first(),
      page.locator("button.jobs-apply-button").first(),
    ];
    for (const loc of candidateLocators) {
      if (await loc.count() > 0) {
        externalEl = await loc.elementHandle();
        if (externalEl) break;
      }
    }
  }

  if (!externalEl) {
    console.warn("  [linkedin] No external apply link found");
    return false;
  }

  const href = await externalEl.getAttribute("href").catch(() => null);
  const [newPageFromClick] = await Promise.all([
    context.waitForEvent("page", { timeout: 10000 }).catch(() => null),
    externalEl.click({ force: true }).catch(() => {}),
  ]);

  // External applies should open in a new tab. If click doesn't spawn one, open href manually.
  let targetPage = newPageFromClick;
  if (!targetPage && href) {
    const absUrl = href.startsWith("http") ? href : new URL(href, page.url()).toString();
    const forcedTab = await context.newPage();
    await forcedTab.goto(absUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    targetPage = forcedTab;
  }
  if (!targetPage) {
    console.warn("  [linkedin] External apply did not open a new tab");
    return false;
  }

  await delayPageLoad(delays);
  await targetPage.waitForLoadState("domcontentloaded").catch(() => {});

  const atsUrl = targetPage.url();
  console.log(`  [linkedin] External apply URL: ${atsUrl}`);
  const ats = detectATS(atsUrl);

  const atsOpts = {
    page: targetPage,
    job,
    profile,
    templates,
    resumePath,
    coverText,
    delays,
    dryRun,
  };

  let result = false;
  switch (ats) {
    case "workday":
      result = await applyOnWorkday(atsOpts);
      break;
    case "lever":
      result = await applyOnLever(atsOpts);
      break;
    case "greenhouse":
      result = await applyOnGreenhouse(atsOpts);
      break;
    case "eightfold":
      console.warn("  [linkedin] Eightfold is excluded from automation; marking as needs_manual");
      result = false;
      break;
    case "oraclecloud":
      console.warn("  [linkedin] Oracle Cloud ATS is excluded from automation; marking as needs_manual");
      result = false;
      break;
    case "unknown":
      result = await applyOnGeneric(atsOpts);
      break;
  }

  await targetPage.close().catch(() => {});
  return result;
}

export async function applyLinkedIn(opts: LinkedInApplyOptions): Promise<boolean> {
  const { page, job, delays, dryRun } = opts;

  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await delayPageLoad(delays);

  console.log(`  [linkedin] Page loaded: ${page.url()}`);
  console.log(`  [linkedin] Page title: ${await page.title()}`);
  await takeScreenshot(page, job.path, "linkedin-page-loaded");

  const applyType = await findApplyButton(page);
  console.log(`  [linkedin] Apply button type: ${applyType ?? "none found"}`);

  if (applyType === "easy") {
    console.log("  [linkedin] Using Easy Apply flow");
    return handleEasyApplyModal(opts);
  }

  if (applyType === "external") {
    console.log("  [linkedin] Using external apply flow");
    return handleExternalApply(opts);
  }

  console.warn("  [linkedin] No apply button found on page");
  await takeScreenshot(page, job.path, "linkedin-no-apply-button");
  return false;
}
