/**
 * Load profile answers and question templates for form filling.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { ProfileAnswers, QuestionTemplate } from "../types.js";

const PROFILE_PATH = "input/profile.yaml";
const TEMPLATES_DIR = "input/templates";

let _profileCache: ProfileAnswers | null = null;
let _profileCwd: string | null = null;

export function loadProfile(): ProfileAnswers {
  const cwd = process.cwd();
  if (_profileCache && _profileCwd === cwd) return _profileCache;

  const path = join(cwd, PROFILE_PATH);
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  _profileCache = (parseYaml(raw) as ProfileAnswers) ?? {};
  _profileCwd = cwd;
  return _profileCache;
}

export function loadQuestionTemplates(site: string): QuestionTemplate[] {
  const path = join(process.cwd(), TEMPLATES_DIR, `${site}-questions.yaml`);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  return (parseYaml(raw) as QuestionTemplate[]) ?? [];
}

export function resetProfileCache(): void {
  _profileCache = null;
  _profileCwd = null;
}
