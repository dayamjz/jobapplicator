/**
 * Generate tailored resume (md, docx) and cover letter (md) for a job.
 * Uses two prompt configs and docx-derived structure.
 */
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { generateWithFallback } from "../llm/router.js";
import { extractResumeStructure, structureToPrompt } from "./docx.js";
import { loadResumePromptConfig, loadCoverPromptConfig, fillTemplate } from "./prompts.js";
import type { Job } from "../types.js";
import type { RunConfig } from "../types.js";
import type { ResumeStructure } from "./docx.js";

export interface GeneratedJobArtifacts {
  jobDir: string;
  resumeMd: string;
  resumeDocxPath?: string;
  coverMd: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function generateForJob(
  job: Job,
  resumePath: string,
  config: RunConfig
): Promise<GeneratedJobArtifacts> {
  const roleSlug = slugify(job.role);
  const jobId = job.jobId;
  const jobDir = join(process.cwd(), "jobs", roleSlug, jobId);
  if (!existsSync(jobDir)) mkdirSync(jobDir, { recursive: true });

  const structure = await extractResumeStructure(resumePath);
  const structureStr = structureToPrompt(structure);

  const resumePromptConfig = loadResumePromptConfig();
  const resumeUser = fillTemplate(resumePromptConfig.userTemplate, {
    jobTitle: job.title,
    company: job.company,
    jobDescription: job.description ?? "",
    resumeStructure: structureStr,
    resumeContent: structure.rawText.slice(0, 4000),
  });
  const resumeMd = await generateWithFallback({
    system: resumePromptConfig.system,
    prompt: resumeUser,
    maxTokens: 2048,
  });

  const coverPromptConfig = loadCoverPromptConfig();
  const coverUser = fillTemplate(coverPromptConfig.userTemplate, {
    jobTitle: job.title,
    company: job.company,
    jobDescription: job.description ?? "",
    resumeSummary: structure.rawText.slice(0, 800),
  });
  const coverMd = await generateWithFallback({
    system: coverPromptConfig.system,
    prompt: coverUser,
    maxTokens: 1024,
  });

  writeFileSync(join(jobDir, "resume.md"), resumeMd);
  writeFileSync(join(jobDir, "cover.md"), coverMd);

  const meta = {
    company: job.company,
    title: job.title,
    URL: job.url,
    site: job.site,
    searchId: job.searchId,
    jobId: job.jobId,
    idSource: job.idSource,
    status: "pending_review" as const,
    compensation: job.compensation,
  };
  writeFileSync(join(jobDir, "meta.json"), JSON.stringify(meta, null, 2));

  if (job.description) {
    writeFileSync(join(jobDir, "job-description.md"), job.description);
  }

  return { jobDir, resumeMd, coverMd };
}
