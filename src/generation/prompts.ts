/**
 * Load prompt configs from input/prompts (resume.yaml, cover.yaml).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

const INPUT_PROMPTS = "input/prompts";

function loadYaml(name: string): Record<string, unknown> {
  const path = join(process.cwd(), INPUT_PROMPTS, name);
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  return (parseYaml(raw) as Record<string, unknown>) ?? {};
}

export function loadResumePromptConfig(): { system: string; userTemplate: string } {
  const config = loadYaml("resume.yaml");
  const system = (config.system as string) ?? "You are a resume expert. Tailor the resume to the job while preserving section structure. Output markdown.";
  const userTemplate = (config.userTemplate as string) ?? "Job: {{jobTitle}} at {{company}}\n\n{{jobDescription}}\n\nResume structure:\n{{resumeStructure}}\n\nContent:\n{{resumeContent}}";
  return { system, userTemplate };
}

export function loadCoverPromptConfig(): { system: string; userTemplate: string } {
  const config = loadYaml("cover.yaml");
  const system = (config.system as string) ?? "You are a cover letter writer. Write a concise, tailored cover letter. Output plain text or markdown.";
  const userTemplate = (config.userTemplate as string) ?? "Job: {{jobTitle}} at {{company}}\n\n{{jobDescription}}\n\nResume summary: {{resumeSummary}}";
  return { system, userTemplate };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v ?? "");
  }
  out = out.replace(/\{\{\w+\}\}/g, "");
  return out;
}
