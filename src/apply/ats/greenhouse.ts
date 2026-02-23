/**
 * Greenhouse ATS apply handler.
 * Typically an embedded form: name, email, phone, resume upload, cover letter, custom questions, demographics, submit.
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

export async function applyOnGreenhouse(opts: ATSApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;
  console.log("  [greenhouse] Starting Greenhouse application flow");

  if (await isLoginPage(page.url(), page)) {
    console.warn("  [greenhouse] Login wall detected");
    return false;
  }
  if (await isCaptchaPage(page)) {
    console.warn("  [greenhouse] CAPTCHA detected");
    return false;
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await delayPageLoad(delays);

  await fillContactInfo(page, profile, delays);
  await uploadFileToVisible(page, resumePath);

  const coverArea = await page.$("textarea#cover_letter, textarea[name*='cover_letter'], textarea[aria-label*='Cover']");
  if (coverArea && coverText) {
    await coverArea.fill(coverText);
    await delayFormField(delays);
  }

  const coverUpload = await page.$("input[type='file'][name*='cover']");
  if (coverUpload) {
    // Some Greenhouse forms accept cover letter as a file upload -- skip if we already pasted
  }

  const { filled, unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
  logUnmatchedFields(unmatched, page.url());
  await fillDiversityQuestions(page, profile, delays);

  if (dryRun) {
    await takeScreenshot(page, job.path, "greenhouse-form");
  }

  const submitBtn = await page.$("button#submit_app, input[type='submit'], button[type='submit']:has-text('Submit'), button:has-text('Submit Application')");
  if (submitBtn) {
    if (dryRun) {
      console.log("  [greenhouse] Dry run: would click Submit");
      return true;
    }
    await submitBtn.click();
    await delayPageLoad(delays);
    console.log("  [greenhouse] Application submitted");
    return true;
  }

  console.warn("  [greenhouse] No submit button found");
  return false;
}
