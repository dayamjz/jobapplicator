/**
 * Generic / unknown ATS best-effort form filler.
 * Scans for all visible form fields, fuzzy-matches against profile, uses LLM for free-form questions.
 * Bails on login walls or CAPTCHAs with needs_manual status.
 */
import type { Page } from "playwright";
import type { ATSApplyOptions } from "./workday.js";
import {
  fillDiversityQuestions,
  fillContactInfo,
  uploadFileToVisible,
  takeScreenshot,
  isLoginPage,
  isCaptchaPage,
} from "../form-filler.js";
import { matchFillAndFallback, logUnmatchedFields } from "../field-matcher.js";
import { delayPageLoad } from "../../utils/delay.js";

export async function applyOnGeneric(opts: ATSApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;
  console.log(`  [generic] Attempting best-effort form fill on: ${page.url()}`);

  if (await isLoginPage(page.url(), page)) {
    console.warn("  [generic] Login wall detected, marking as needs_manual");
    return false;
  }
  if (await isCaptchaPage(page)) {
    console.warn("  [generic] CAPTCHA detected, marking as needs_manual");
    return false;
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await delayPageLoad(delays);

  let step = 0;
  const MAX_STEPS = 6;

  while (step < MAX_STEPS) {
    step++;
    console.log(`  [generic] Form page ${step}`);

    if (step > 1) {
      if (await isLoginPage(page.url(), page)) return false;
      if (await isCaptchaPage(page)) return false;
    }

    await fillContactInfo(page, profile, delays);
    await uploadFileToVisible(page, resumePath);

    const { filled, unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
    logUnmatchedFields(unmatched, page.url());
    await fillDiversityQuestions(page, profile, delays);

    if (dryRun) {
      await takeScreenshot(page, job.path, `generic-step-${step}`);
    }

    const submitBtn = await page.$("button[type='submit']:has-text('Submit'), input[type='submit'], button:has-text('Submit Application'), button:has-text('Apply')");
    if (submitBtn) {
      const text = (await submitBtn.textContent?.() ?? "").toLowerCase();
      if (text.includes("submit") || text.includes("apply")) {
        if (dryRun) {
          console.log("  [generic] Dry run: would click Submit");
          return true;
        }
        await submitBtn.click({ force: true, timeout: 5000 }).catch(() => {});
        await delayPageLoad(delays);
        console.log("  [generic] Application submitted");
        return true;
      }
    }

    const nextBtn = await page.$("button:has-text('Next'), button:has-text('Continue'), a:has-text('Next'), a:has-text('Continue')");
    if (nextBtn) {
      await nextBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      await delayPageLoad(delays);
      continue;
    }

    break;
  }

  console.warn("  [generic] Could not complete form fill");
  return false;
}
