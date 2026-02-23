/**
 * LLM-generated answers for free-form application questions.
 * Caches answers by normalized question text in input/answer-cache.json.
 * Flags new question types for review in dry-run mode.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { Page } from "playwright";
import { generateWithFallback } from "../llm/router.js";
import type { ProfileAnswers, DelayConfig } from "../types.js";
import { fillTextField, type FieldInfo } from "./form-filler.js";
import type { JobFolder } from "./runner.js";

const ANSWER_CACHE_PATH = "input/answer-cache.json";

export interface AnswerCacheEntry {
  questionPattern: string;
  answer: string;
  reviewedByHuman: boolean;
}

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function loadAnswerCache(): AnswerCacheEntry[] {
  const path = join(process.cwd(), ANSWER_CACHE_PATH);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AnswerCacheEntry[];
  } catch {
    return [];
  }
}

function saveAnswerCache(cache: AnswerCacheEntry[]): void {
  const path = join(process.cwd(), ANSWER_CACHE_PATH);
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function getCachedAnswer(question: string): AnswerCacheEntry | null {
  const cache = loadAnswerCache();
  const norm = normalizeQuestion(question);
  return cache.find((e) => e.questionPattern === norm) ?? null;
}

function isStaticQuestion(question: string): boolean {
  const staticPatterns = [
    "authorized to work",
    "legally authorized",
    "work authorization",
    "require sponsorship",
    "visa sponsorship",
    "18 years",
    "background check",
    "drug test",
    "non-compete",
    "start date",
    "how did you hear",
  ];
  const norm = normalizeQuestion(question);
  return staticPatterns.some((p) => norm.includes(p));
}

function shouldSkipLlmForField(label: string): boolean {
  const norm = normalizeQuestion(label);
  const skipPatterns = [
    "im looking for",
    "search",
    "keyword",
    "job title",
    "location city",
    "location state",
    "city",
    "state",
    "province",
    "country code",
    "phone number",
    "first name",
    "last name",
    "email",
    "chatbot",
    "chat bot",
    "cookie",
    "cookie list",
    "search",
    "search box",
    "search input",
    "assistant",
    "help",
    "send button",
    "captcha",
    "newsletter",
    "subscribe",
    "sign in",
    "log in",
    "location city",
    "location state",
  ];
  return skipPatterns.some((p) => norm === p || norm.includes(p));
}

async function isInteractableTextField(field: FieldInfo): Promise<boolean> {
  const visible = await field.element.isVisible().catch(() => false);
  if (!visible) return false;
  return field.element.evaluate((el) => {
    const inp = el as HTMLInputElement;
    if ((inp as any).disabled) return false;
    if ((inp as any).readOnly) return false;
    const ariaHidden = inp.getAttribute("aria-hidden");
    if (ariaHidden === "true") return false;
    const style = window.getComputedStyle(inp);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }).catch(() => false);
}

export async function generateAnswer(
  question: string,
  job: JobFolder,
  resumeText: string,
): Promise<string> {
  const cached = getCachedAnswer(question);
  if (cached && isStaticQuestion(question)) {
    return cached.answer;
  }

  const metaPath = join(job.path, "meta.json");
  let jobInfo = `${job.role} at ${job.company}`;
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (meta.title) jobInfo = `${meta.title} at ${meta.company}`;
    } catch {}
  }

  const system = `You are filling out a job application form. Answer the following question concisely and professionally. Base your answer on the candidate's resume and the specific job they are applying to. Keep answers under 200 words unless the question asks for more detail.

Candidate resume summary:
${resumeText.slice(0, 2000)}

Job: ${jobInfo}`;

  const answer = await generateWithFallback({
    system,
    prompt: question,
    maxTokens: 512,
  });

  const cache = loadAnswerCache();
  const norm = normalizeQuestion(question);
  const existing = cache.findIndex((e) => e.questionPattern === norm);
  const entry: AnswerCacheEntry = {
    questionPattern: norm,
    answer: answer.trim(),
    reviewedByHuman: false,
  };

  if (existing >= 0) {
    if (isStaticQuestion(question)) {
      return cache[existing].answer;
    }
    cache[existing] = entry;
  } else {
    cache.push(entry);
  }
  saveAnswerCache(cache);

  return answer.trim();
}

export async function generateAndFillUnmatched(
  page: Page,
  unmatchedFields: FieldInfo[],
  job: JobFolder,
  profile: ProfileAnswers,
  delays: DelayConfig,
  dryRun: boolean,
): Promise<void> {
  const resumePath = join(job.path, "resume.md");
  let resumeText = "";
  if (existsSync(resumePath)) {
    resumeText = readFileSync(resumePath, "utf-8");
  }

  for (const field of unmatchedFields) {
    if (field.type === "file" || field.type === "hidden") continue;
    if (field.tag === "select" || field.type === "radio" || field.type === "checkbox") continue;
    if (field.tag !== "textarea" && field.type !== "text") continue;

    const label = field.label || field.name || field.placeholder;
    if (!label || label.length < 5) continue;
    if (shouldSkipLlmForField(label)) {
      console.log(`  [llm] Skipping non-LLM field: "${label}"`);
      continue;
    }
    if (!(await isInteractableTextField(field))) {
      console.log(`  [llm] Skipping non-interactable field: "${label}"`);
      continue;
    }

    console.log(`  [llm] Generating answer for: "${label}"`);
    try {
      const answer = await generateAnswer(label, job, resumeText);
      if (dryRun) {
        console.log(`  [llm] Would fill "${label}" with: ${answer.slice(0, 80)}...`);
      }
      await fillTextField(page, field, answer, delays);
    } catch (err) {
      console.warn(`  [llm] Failed to generate answer for "${label}":`, (err as Error).message);
    }
  }
}
