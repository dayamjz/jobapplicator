/**
 * Lever ATS apply handler.
 * Single-page form: name, email, phone, resume upload, cover letter textarea, custom questions, diversity, submit.
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
import { delayPageLoad, delayFormField } from "../../utils/delay.js";

export async function applyOnLever(opts: ATSApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;
  console.log("  [lever] Starting Lever application flow");

  if (await isLoginPage(page.url(), page)) {
    console.warn("  [lever] Login wall detected");
    return false;
  }
  if (await isCaptchaPage(page)) {
    console.warn("  [lever] CAPTCHA detected");
    return false;
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await delayPageLoad(delays);

  await fillContactInfo(page, profile, delays);
  await uploadFileToVisible(page, resumePath);

  const coverArea = await page.$("textarea[name='comments'], textarea[name*='cover'], textarea.application-answer");
  if (coverArea && coverText) {
    await coverArea.fill(coverText);
    await delayFormField(delays);
  }

  const { filled, unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
  logUnmatchedFields(unmatched, page.url());
  await fillDiversityQuestions(page, profile, delays);

  if (dryRun) {
    await takeScreenshot(page, job.path, "lever-form");
  }

  const submitBtn = await page.$("button.postings-btn-submit, button[type='submit']:has-text('Submit'), button:has-text('Submit application')");
  if (submitBtn) {
    if (dryRun) {
      console.log("  [lever] Dry run: would click Submit");
      return true;
    }
    await submitBtn.click();
    await delayPageLoad(delays);
    console.log("  [lever] Application submitted");
    return true;
  }

  console.warn("  [lever] No submit button found");
  return false;
}
