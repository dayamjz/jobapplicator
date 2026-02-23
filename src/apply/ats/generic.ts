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
  extractFormFields,
} from "../form-filler.js";
import { matchFillAndFallback, logUnmatchedFields } from "../field-matcher.js";
import { delayPageLoad } from "../../utils/delay.js";

interface ApplyButtonInfo {
  tag: string;
  text: string;
  aria: string;
  value: string;
}

async function listApplyButtons(page: Page): Promise<ApplyButtonInfo[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("button, a, input[type='submit'], input[type='button']"));
    const rows = nodes.map((el) => {
      const html = el as HTMLElement;
      const input = el as HTMLInputElement;
      return {
        tag: el.tagName.toLowerCase(),
        text: (html.innerText || html.textContent || "").trim(),
        aria: (el.getAttribute("aria-label") || "").trim(),
        value: (input.value || "").trim(),
      };
    });
    const isApplyLike = (v: string) => /apply( now)?|apply on company|start application/i.test(v);
    return rows.filter((r) => isApplyLike(r.text) || isApplyLike(r.aria) || isApplyLike(r.value));
  }).catch(() => []);
}

async function logFieldScan(page: Page, step: number): Promise<void> {
  const fields = await extractFormFields(page);
  console.log(`  [generic] Field scan step ${step}: ${fields.length} field(s)`);
  for (const f of fields.slice(0, 30)) {
    const label = f.label || f.name || f.placeholder || "(no label)";
    console.log(`    - [${f.required ? "required" : "optional"}] ${f.tag}/${f.type || "text"}: ${label}`);
  }
}

async function clickEntryApplyButtonIfNeeded(page: Page, delays: ATSApplyOptions["delays"]): Promise<void> {
  const fields = await extractFormFields(page);
  if (fields.length > 0) return;

  const applyButtons = await listApplyButtons(page);
  if (applyButtons.length === 0) return;

  console.log("  [generic] Found apply-like button(s) before form:");
  for (const btn of applyButtons.slice(0, 10)) {
    const label = btn.text || btn.aria || btn.value || "(no label)";
    console.log(`    - ${btn.tag}: ${label}`);
  }

  const clickTarget = await page
    .locator("button, a, input[type='submit'], input[type='button']")
    .filter({ hasText: /apply|start application/i })
    .first()
    .elementHandle()
    .catch(() => null);
  if (!clickTarget) return;

  await clickTarget.click({ force: true, timeout: 5000 }).catch(() => {});
  await delayPageLoad(delays);
}

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
  await clickEntryApplyButtonIfNeeded(page, delays);

  const initialApplyButtons = await listApplyButtons(page);
  if (initialApplyButtons.length > 0) {
    console.log("  [generic] Apply button inventory:");
    for (const btn of initialApplyButtons.slice(0, 10)) {
      const label = btn.text || btn.aria || btn.value || "(no label)";
      console.log(`    - ${btn.tag}: ${label}`);
    }
  }

  let step = 0;
  const MAX_STEPS = 6;

  while (step < MAX_STEPS) {
    step++;
    console.log(`  [generic] Form page ${step}`);

    if (step > 1) {
      if (await isLoginPage(page.url(), page)) return false;
      if (await isCaptchaPage(page)) return false;
    }

    await logFieldScan(page, step);
    await fillContactInfo(page, profile, delays);
    await uploadFileToVisible(page, resumePath);

    const { filled, unmatched } = await matchFillAndFallback(page, job, profile, coverText, delays, dryRun);
    if (unmatched.length > 0) {
      console.log(`  [generic] Fields still needing fill after pattern pass: ${unmatched.length}`);
      for (const f of unmatched.slice(0, 20)) {
        const label = f.label || f.name || f.placeholder || "(no label)";
        console.log(`    - ${f.tag}/${f.type || "text"}: ${label}`);
      }
    }
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
