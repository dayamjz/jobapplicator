/**
 * Workday ATS apply handler.
 * Multi-page form: My Information -> My Experience -> Application Questions -> Voluntary Disclosures -> Review.
 */
import type { Page } from "playwright";
import type { ProfileAnswers, QuestionTemplate, DelayConfig } from "../../types.js";
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
import type { JobFolder } from "../runner.js";

export interface ATSApplyOptions {
  page: Page;
  job: JobFolder;
  profile: ProfileAnswers;
  templates: QuestionTemplate[];
  resumePath: string;
  coverText: string;
  delays: DelayConfig;
  dryRun: boolean;
}

export async function applyOnWorkday(opts: ATSApplyOptions): Promise<boolean> {
  const { page, job, profile, resumePath, coverText, delays, dryRun } = opts;
  console.log("  [workday] Starting Workday application flow");

  if (await isLoginPage(page.url(), page)) {
    console.warn("  [workday] Login wall detected, marking as needs_manual");
    return false;
  }
  if (await isCaptchaPage(page)) {
    console.warn("  [workday] CAPTCHA detected, marking as needs_manual");
    return false;
  }

  let step = 0;
  const MAX_STEPS = 8;

  while (step < MAX_STEPS) {
    step++;
    console.log(`  [workday] Page ${step}`);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await delayPageLoad(delays);

    await fillContactInfo(page, profile, delays);
    await uploadFileToVisible(page, resumePath);

    const { filled, unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
    logUnmatchedFields(unmatched, page.url());

    const coverArea = await page.$("textarea[data-automation-id*='cover'], textarea[aria-label*='Cover Letter'], textarea[name*='cover']");
    if (coverArea && coverText) {
      await coverArea.fill(coverText);
      await delayFormField(delays);
    }

    await fillDiversityQuestions(page, profile, delays);

    if (dryRun) {
      await takeScreenshot(page, job.path, `workday-step-${step}`);
    }

    const submitBtn = await page.$("button[data-automation-id='bottom-navigation-next-button']:has-text('Submit'), button:has-text('Submit')");
    if (submitBtn) {
      const text = (await submitBtn.textContent() ?? "").toLowerCase();
      if (text.includes("submit")) {
        if (dryRun) {
          console.log("  [workday] Dry run: would click Submit");
          return true;
        }
        await submitBtn.click();
        await delayPageLoad(delays);
        console.log("  [workday] Application submitted");
        return true;
      }
    }

    const nextBtn = await page.$("button[data-automation-id='bottom-navigation-next-button'], button:has-text('Next'), button:has-text('Continue'), button:has-text('Save and Continue')");
    if (nextBtn) {
      await nextBtn.click();
      await delayPageLoad(delays);
      continue;
    }

    break;
  }

  console.warn("  [workday] Flow ended without submission");
  return false;
}
