/**
 * Indeed apply handler: clicks Apply Now, handles native Indeed form or redirects to external ATS.
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

export interface IndeedApplyOptions {
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

async function handleNativeIndeedForm(opts: IndeedApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;

  let step = 0;
  const MAX_STEPS = 8;

  while (step < MAX_STEPS) {
    step++;
    console.log(`  [indeed] Form step ${step}`);

    await uploadFileToVisible(page, resumePath);
    await fillContactInfo(page, profile, delays);

    const { unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
    logUnmatchedFields(unmatched, page.url());

    const coverArea = await page.$("textarea[name*='cover'], textarea[aria-label*='cover letter']");
    if (coverArea && coverText) {
      await coverArea.fill(coverText);
      await delayFormField(delays);
    }

    await fillDiversityQuestions(page, profile, delays);

    if (dryRun) {
      await takeScreenshot(page, job.path, `indeed-step-${step}`);
    }

    const submitBtn = await page.$("button[type='submit']:has-text('Submit'), button:has-text('Submit your application'), button:has-text('Apply')");
    if (submitBtn) {
      const btnText = (await submitBtn.textContent() ?? "").toLowerCase();
      if (btnText.includes("submit") || btnText.includes("apply")) {
        if (dryRun) {
          console.log("  [indeed] Dry run: would click Submit");
          await takeScreenshot(page, job.path, "indeed-submit");
          return true;
        }
        await submitBtn.click();
        await delayPageLoad(delays);
        console.log("  [indeed] Application submitted");
        return true;
      }
    }

    const continueBtn = await page.$("button:has-text('Continue'), button:has-text('Next'), a:has-text('Continue')");
    if (continueBtn) {
      await continueBtn.click();
      await delayPageLoad(delays);
      continue;
    }

    break;
  }

  console.warn("  [indeed] Form flow ended without submit");
  return false;
}

export async function applyIndeed(opts: IndeedApplyOptions): Promise<boolean> {
  const { page, context, job, profile, templates, resumePath, coverText, delays, dryRun } = opts;

  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await delayPageLoad(delays);

  const applyBtn = await page.$("button#indeedApplyButton, button:has-text('Apply now'), a:has-text('Apply now'), a:has-text('Apply on company site')");
  if (!applyBtn) {
    console.warn("  [indeed] No apply button found");
    return false;
  }

  const initialUrl = page.url();
  const [newPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 8000 }).catch(() => null),
    applyBtn.click(),
  ]);

  const targetPage = newPage ?? page;
  await delayPageLoad(delays);
  await targetPage.waitForLoadState("domcontentloaded").catch(() => {});

  const currentUrl = targetPage.url();
  const isExternal = !currentUrl.includes("indeed.com") && currentUrl !== initialUrl;

  if (isExternal) {
    console.log(`  [indeed] Redirected to external ATS: ${currentUrl}`);
    const ats = detectATS(currentUrl);
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
      case "unknown":
        result = await applyOnGeneric(atsOpts);
        break;
    }

    if (newPage && newPage !== page) {
      await newPage.close().catch(() => {});
    }
    return result;
  }

  return handleNativeIndeedForm(opts);
}
