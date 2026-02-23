/**
 * Unified pattern-based field matching engine.
 * Loads field-patterns.yaml, matches form field labels against regex patterns,
 * resolves profile keys (including dynamic capture groups), and falls back to
 * LLM-generated answers for truly unknown text fields.
 */
import { readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";
import type { Page } from "playwright";
import type { ProfileAnswers, DelayConfig } from "../types.js";
import {
  extractFormFields,
  fillTextField,
  fillSelectField,
  fillRadioOrCheckbox,
  shouldOverwriteTextField,
  type FieldInfo,
} from "./form-filler.js";
import { generateAndFillUnmatched } from "./llm-answers.js";
import type { JobFolder } from "./runner.js";

export interface FieldPattern {
  pattern: string;
  key: string;
  fallback?: string;
  onlyIfRequired?: boolean;
}

let _patternsCache: FieldPattern[] | null = null;

function loadFieldPatterns(): FieldPattern[] {
  if (_patternsCache) return _patternsCache;
  const fp = join(process.cwd(), "input/field-patterns.yaml");
  if (!existsSync(fp)) {
    console.warn("[field-matcher] input/field-patterns.yaml not found, no patterns loaded");
    return [];
  }
  const raw = readFileSync(fp, "utf-8");
  _patternsCache = yaml.parse(raw) as FieldPattern[];
  return _patternsCache;
}

export function resetPatternCache(): void {
  _patternsCache = null;
}

function isFieldRequired(field: FieldInfo): boolean {
  if (field.required) return true;
  const label = (field.label ?? "").trim();
  if (label.endsWith("*") || label.includes("(required)")) return true;
  return false;
}

/**
 * Try to match a field label against the pattern list.
 * Returns the resolved profile value, or null if no match.
 */
export function matchFieldToPattern(
  label: string,
  profile: ProfileAnswers,
  coverText: string,
  required: boolean,
): string | null {
  const patterns = loadFieldPatterns();
  const labelLower = label.toLowerCase();

  for (const pat of patterns) {
    const re = new RegExp(pat.pattern, "i");
    const m = labelLower.match(re);
    if (!m) continue;

    if (pat.onlyIfRequired && !required) {
      return null;
    }

    let resolvedKey = pat.key;
    if (m.length > 1 && resolvedKey.includes("$1")) {
      const captured = m[1].toLowerCase().replace(/[^a-z0-9]/g, "");
      resolvedKey = resolvedKey.replace("$1", captured);
    }

    const value = profile[resolvedKey];

    if (value) return value;

    if (pat.fallback === "coverLetter" && coverText) {
      return coverText.slice(0, 500);
    }

    return null;
  }
  return null;
}

function shouldSkipOptionalPattern(label: string, required: boolean): boolean {
  if (required) return false;
  const patterns = loadFieldPatterns();
  const labelLower = label.toLowerCase();
  return patterns.some((pat) => pat.onlyIfRequired && new RegExp(pat.pattern, "i").test(labelLower));
}

async function hasMeaningfulSelectValue(field: FieldInfo): Promise<boolean> {
  if (field.tag !== "select") return false;
  const selected = await field.element.evaluate((el) => {
    const select = el as HTMLSelectElement;
    const option = select.selectedOptions?.[0];
    return {
      value: select.value ?? "",
      text: option?.textContent?.trim() ?? "",
    };
  }).catch(() => ({ value: "", text: "" }));
  const valueNorm = selected.value.trim().toLowerCase();
  const textNorm = selected.text.trim().toLowerCase();
  if (!valueNorm && !textNorm) return false;
  const placeholderLike = [
    "select",
    "choose",
    "please select",
    "please choose",
    "select one",
    "choose one",
  ];
  return !placeholderLike.some((p) => valueNorm === p || textNorm === p || textNorm.includes(p));
}

export interface MatchAndFillResult {
  filled: string[];
  unmatched: FieldInfo[];
}

/**
 * Main entry point: extract fields from the page, match them against
 * field-patterns.yaml + profile.yaml, fill matches, and return unmatched
 * fields for downstream LLM handling.
 */
export async function matchAndFillFields(
  page: Page,
  profile: ProfileAnswers,
  coverText: string,
  delays: DelayConfig,
  scopeSelector?: string,
): Promise<MatchAndFillResult> {
  const fields = await extractFormFields(page, scopeSelector);
  const filled: string[] = [];
  const unmatched: FieldInfo[] = [];

  for (const field of fields) {
    if (field.type === "file") continue;

    const label = field.label || field.name || field.placeholder;
    if (!label) {
      unmatched.push(field);
      continue;
    }

    const required = isFieldRequired(field);
    const value = matchFieldToPattern(label, profile, coverText, required);

    // If a pattern matched but is configured only for required fields, skip silently.
    if (!value && shouldSkipOptionalPattern(label, required)) {
      continue;
    }

    if (value) {
      // Keep user-provided values in-place; only overwrite obvious placeholder defaults.
      if (field.tag === "select") {
        if (await hasMeaningfulSelectValue(field)) {
          filled.push(`${label} = (pre-filled select)`);
          continue;
        }
      } else if (field.type !== "radio" && field.type !== "checkbox") {
        const shouldOverwrite = await shouldOverwriteTextField(field);
        if (!shouldOverwrite) {
          const currentVal = await field.element.inputValue().catch(() => "");
          filled.push(`${label} = (pre-filled: ${currentVal})`);
          continue;
        }
      }
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

/**
 * Full pipeline: pattern match -> LLM fallback for unmatched text fields.
 */
export async function matchFillAndFallback(
  page: Page,
  job: JobFolder,
  profile: ProfileAnswers,
  coverText: string,
  delays: DelayConfig,
  dryRun: boolean,
  scopeSelector?: string,
): Promise<MatchAndFillResult> {
  const result = await matchAndFillFields(page, profile, coverText, delays, scopeSelector);
  console.log(`  [field-matcher] Pattern-matched ${result.filled.length} fields, ${result.unmatched.length} unmatched`);

  await generateAndFillUnmatched(page, result.unmatched, job, profile, delays, dryRun);

  return result;
}

/**
 * Append unmatched field info to input/unmatched-fields.log so the user
 * can add new patterns for them.
 */
export function logUnmatchedFields(
  unmatchedFields: FieldInfo[],
  pageUrl: string,
): void {
  if (unmatchedFields.length === 0) return;
  const logPath = join(process.cwd(), "input/unmatched-fields.log");
  const ts = new Date().toISOString();
  const lines = unmatchedFields
    .filter((f) => {
      const label = f.label || f.name || f.placeholder;
      return label && label.length >= 3;
    })
    .map((f) => {
      const label = f.label || f.name || f.placeholder;
      return `[${ts}] url=${pageUrl} label="${label}" tag=${f.tag} type=${f.type}`;
    });
  if (lines.length > 0) {
    appendFileSync(logPath, lines.join("\n") + "\n");
  }
}
