/**
 * Shared form-filling utilities used by all apply modules.
 * Fuzzy field matching, diversity filling, file upload, contact info.
 */
import type { Page, ElementHandle } from "playwright";
import type { ProfileAnswers, QuestionTemplate, DelayConfig } from "../types.js";
import { delayFormField } from "../utils/delay.js";

const NORMALIZE_RE = /[^a-z0-9]/g;

function normalize(s: string): string {
  return s.toLowerCase().replace(NORMALIZE_RE, "");
}

function isPlaceholderLikeValue(
  currentValue: string,
  fieldLabel: string,
  fieldName: string,
  fieldPlaceholder: string,
): boolean {
  const currentNorm = normalize(currentValue.trim());
  if (!currentNorm) return true;

  const labelNorm = normalize(fieldLabel);
  const nameNorm = normalize(fieldName);
  const placeholderNorm = normalize(fieldPlaceholder);
  if (currentNorm === labelNorm || currentNorm === nameNorm || currentNorm === placeholderNorm) {
    return true;
  }

  // Common generic defaults used by forms and QA test data.
  const genericDefaults = new Set([
    "name",
    "firstname",
    "lastname",
    "fullname",
    "email",
    "phone",
    "city",
    "state",
    "location",
    "test",
    "na",
    "n/a",
  ]);
  return genericDefaults.has(currentNorm);
}

export async function shouldOverwriteTextField(field: FieldInfo): Promise<boolean> {
  const currentVal = await field.element.inputValue().catch(() => "");
  if (!currentVal.trim()) return true;
  return isPlaceholderLikeValue(currentVal, field.label, field.name, field.placeholder);
}

function fuzzyMatch(label: string, candidates: string[]): string | null {
  const norm = normalize(label);
  for (const c of candidates) {
    if (normalize(c) === norm) return c;
  }
  for (const c of candidates) {
    if (norm.includes(normalize(c)) || normalize(c).includes(norm)) return c;
  }
  return null;
}

export function matchProfileKey(label: string, profile: ProfileAnswers): string | null {
  const keys = Object.keys(profile);
  return fuzzyMatch(label, keys);
}

export function matchTemplateId(label: string, templates: QuestionTemplate[]): QuestionTemplate | null {
  for (const t of templates) {
    const normLabel = normalize(label);
    const normTLabel = normalize(t.label);
    const normId = normalize(t.id);
    if (normLabel === normTLabel || normLabel === normId) return t;
    if (normLabel.includes(normTLabel) || normTLabel.includes(normLabel)) return t;
  }
  return null;
}

export interface FieldInfo {
  element: ElementHandle;
  tag: string;
  type: string;
  label: string;
  name: string;
  placeholder: string;
  required: boolean;
}

export async function extractFormFields(page: Page, scopeSelector?: string): Promise<FieldInfo[]> {
  // Use Playwright's $$ which pierces Shadow DOM, unlike document.querySelectorAll
  const fieldSelector = "input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea";
  let elements: ElementHandle[];
  if (scopeSelector) {
    const scope = await page.$(scopeSelector);
    elements = scope ? await scope.$$(fieldSelector) : await page.$$(fieldSelector);
  } else {
    elements = await page.$$(fieldSelector);
  }

  const result: FieldInfo[] = [];
  for (const el of elements) {
    const info = await el.evaluate((htmlEl) => {
      const inp = htmlEl as HTMLInputElement;
      let label = "";
      const id = inp.id;
      if (id) {
        const root = inp.getRootNode() as Document | ShadowRoot;
        const labelEl = ("querySelector" in root)
          ? root.querySelector(`label[for="${id}"]`)
          : document.querySelector(`label[for="${id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() ?? "";
      }
      if (!label) label = inp.getAttribute("aria-label") ?? "";
      if (!label) label = inp.placeholder ?? "";
      if (!label) {
        const parent = inp.closest(".form-group, .field, .question, [class*='field'], [class*='question']");
        if (parent) {
          const lbl = parent.querySelector("label, .label, legend, [class*='label']");
          if (lbl) label = lbl.textContent?.trim() ?? "";
        }
      }
      const isRequired = inp.required
        || inp.getAttribute("aria-required") === "true"
        || label.includes("*")
        || label.toLowerCase().includes("(required)");
      return {
        tag: inp.tagName.toLowerCase(),
        type: inp.type ?? "",
        label,
        name: inp.name ?? "",
        placeholder: inp.placeholder ?? "",
        required: isRequired,
      };
    });
    result.push({ element: el, ...info });
  }
  return result;
}

export async function fillTextField(page: Page, field: FieldInfo, value: string, delays: DelayConfig): Promise<void> {
  await field.element.click({ force: true, timeout: 5000 }).catch(() => {});
  await delayFormField(delays);
  await field.element.fill(value);
  await delayFormField(delays);
}

export async function fillSelectField(page: Page, field: FieldInfo, value: string, delays: DelayConfig): Promise<void> {
  try {
    await field.element.selectOption({ label: value });
  } catch {
    try {
      await field.element.selectOption({ value });
    } catch {
      await field.element.selectOption({ index: 1 });
    }
  }
  await delayFormField(delays);
}

export async function fillRadioOrCheckbox(page: Page, field: FieldInfo, value: string, delays: DelayConfig): Promise<void> {
  const val = value.toLowerCase();
  if (val === "yes" || val === "true" || val === "1") {
    await field.element.check({ force: true, timeout: 5000 }).catch(() => {});
  } else {
    await field.element.uncheck({ force: true, timeout: 5000 }).catch(() => {});
  }
  await delayFormField(delays);
}

export async function uploadFile(page: Page, selector: string, filePath: string): Promise<void> {
  const input = await page.$(selector);
  if (input) {
    await input.setInputFiles(filePath);
  }
}

export async function uploadFileToVisible(page: Page, filePath: string): Promise<boolean> {
  const fileInputs = await page.$$("input[type='file']");
  if (fileInputs.length > 0) {
    await fileInputs[0].setInputFiles(filePath);
    return true;
  }
  return false;
}

export async function fillContactInfo(page: Page, profile: ProfileAnswers, delays: DelayConfig): Promise<void> {
  const mapping: Record<string, string[]> = {
    first_name: ["first name", "first_name", "firstname", "given name"],
    last_name: ["last name", "last_name", "lastname", "surname", "family name"],
    email: ["email", "e-mail", "email address"],
    phone: ["phone", "telephone", "phone number", "mobile"],
    city: ["city"],
    state: ["state", "province"],
  };

  const fields = await extractFormFields(page);
  for (const field of fields) {
    if (field.tag === "select") continue;
    const shouldOverwrite = await shouldOverwriteTextField(field);
    if (!shouldOverwrite) continue;
    const labelNorm = normalize(field.label || field.name || field.placeholder);
    for (const [profileKey, aliases] of Object.entries(mapping)) {
      const value = profile[profileKey];
      if (!value) continue;
      if (aliases.some((a) => labelNorm.includes(normalize(a)))) {
        await fillTextField(page, field, value, delays);
        break;
      }
    }
  }
}

const DIVERSITY_MAPPING: Record<string, string[]> = {
  gender: ["gender", "sex"],
  ethnicity: ["race", "ethnicity", "ethnic"],
  veteran_status: ["veteran", "protected veteran"],
  disability_status: ["disability", "disabled"],
};

export async function fillDiversityQuestions(page: Page, profile: ProfileAnswers, delays: DelayConfig): Promise<void> {
  const fields = await extractFormFields(page);
  for (const field of fields) {
    const labelNorm = normalize(field.label || field.name);
    for (const [profileKey, keywords] of Object.entries(DIVERSITY_MAPPING)) {
      const value = profile[profileKey];
      if (!value) continue;
      if (keywords.some((kw) => labelNorm.includes(normalize(kw)))) {
        if (field.tag === "select") {
          await fillSelectField(page, field, value, delays);
        } else if (field.type === "radio" || field.type === "checkbox") {
          await fillRadioOrCheckbox(page, field, value, delays);
        } else {
          await fillTextField(page, field, value, delays);
        }
        break;
      }
    }
  }
}

export async function fillFieldsFromProfile(
  page: Page,
  profile: ProfileAnswers,
  templates: QuestionTemplate[],
  delays: DelayConfig
): Promise<{ filled: string[]; unmatched: FieldInfo[] }> {
  const fields = await extractFormFields(page);
  const filled: string[] = [];
  const unmatched: FieldInfo[] = [];

  for (const field of fields) {
    if (field.type === "file") continue;

    const label = field.label || field.name || field.placeholder;
    if (!label) {
      unmatched.push(field);
      continue;
    }

    const template = matchTemplateId(label, templates);
    const profileKey = template?.id ?? matchProfileKey(label, profile);

    if (profileKey && profile[profileKey]) {
      const value = profile[profileKey];
      if (field.tag === "select") {
        await fillSelectField(page, field, value, delays);
      } else if (field.type === "radio" || field.type === "checkbox") {
        await fillRadioOrCheckbox(page, field, value, delays);
      } else {
        await fillTextField(page, field, value, delays);
      }
      filled.push(`${label} = ${value}`);
    } else {
      unmatched.push(field);
    }
  }

  return { filled, unmatched };
}

export async function takeScreenshot(page: Page, dir: string, name: string): Promise<string> {
  const { mkdirSync, existsSync } = await import("fs");
  const { join } = await import("path");
  const screenshotDir = join(dir, "screenshots");
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
  const path = join(screenshotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

export async function isLoginPage(_url: string, page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const forms = document.querySelectorAll("form");
    for (const form of Array.from(forms)) {
      const passwordInput = form.querySelector("input[type='password']");
      if (passwordInput) return true;
    }
    return false;
  });
}

export async function isCaptchaPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const selectors = [
      "iframe[src*='captcha']",
      "iframe[src*='recaptcha']",
      "iframe[src*='hcaptcha']",
      "[class*='captcha']",
      "[id*='captcha']",
      "#cf-challenge-running",
    ];
    return selectors.some((s) => document.querySelector(s) !== null);
  });
}
