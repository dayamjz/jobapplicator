/**
 * Generate tailored resume (md, docx) and cover letter (md) for a job.
 * Resume content is placed in the system prompt so LLM providers can cache it
 * across multiple job calls (identical system prompt = cached tokens).
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { generateWithFallback } from "../llm/router.js";
import { extractResumeStructure, structureToPrompt } from "./docx.js";
import { loadResumePromptConfig, loadCoverPromptConfig, fillTemplate } from "./prompts.js";
import type { Job } from "../types.js";
import type { RunConfig } from "../types.js";
import type { ResumeStructure } from "./docx.js";
import { getJobPathFromJob } from "../utils/job-path.js";

export interface GeneratedJobArtifacts {
  jobDir: string;
  resumeMd: string;
  resumeDocxPath?: string;
  coverMd: string;
}

export interface PrebuiltPrompts {
  resumeSystem: string;
  coverSystem: string;
}

export function buildPrebuiltPrompts(structure: ResumeStructure): PrebuiltPrompts {
  const structureStr = structureToPrompt(structure);

  const resumeVars = {
    resumeStructure: structureStr,
    resumeContent: structure.rawText,
  };
  const resumePromptConfig = loadResumePromptConfig();
  const resumeSystem = fillTemplate(resumePromptConfig.system, resumeVars);

  const coverVars = {
    resumeSummary: structure.rawText.slice(0, 800),
  };
  const coverPromptConfig = loadCoverPromptConfig();
  const coverSystem = fillTemplate(coverPromptConfig.system, coverVars);

  return { resumeSystem, coverSystem };
}

export async function generateForJob(
  job: Job,
  resumePath: string,
  config: RunConfig,
  cachedStructure?: ResumeStructure,
  prebuilt?: PrebuiltPrompts
): Promise<GeneratedJobArtifacts> {
  const jobDir = getJobPathFromJob(job);
  if (!existsSync(jobDir)) mkdirSync(jobDir, { recursive: true });

  const resumePath_ = join(jobDir, "resume.md");
  const coverPath_ = join(jobDir, "cover.md");
  if (existsSync(resumePath_) && existsSync(coverPath_)) {
    console.log(`  Skipping LLM generation (artifacts exist): ${jobDir}`);
    return {
      jobDir,
      resumeMd: readFileSync(resumePath_, "utf-8"),
      coverMd: readFileSync(coverPath_, "utf-8"),
    };
  }

  let resumeSystem: string;
  let coverSystem: string;

  if (prebuilt) {
    resumeSystem = prebuilt.resumeSystem;
    coverSystem = prebuilt.coverSystem;
  } else {
    const structure = cachedStructure ?? await extractResumeStructure(resumePath);
    const built = buildPrebuiltPrompts(structure);
    resumeSystem = built.resumeSystem;
    coverSystem = built.coverSystem;
  }

  const resumePromptConfig = loadResumePromptConfig();
  const resumeUser = fillTemplate(resumePromptConfig.userTemplate, {
    jobTitle: job.title,
    company: job.company,
    jobDescription: job.description ?? "",
  });
  const resumeMd = await generateWithFallback({
    system: resumeSystem,
    prompt: resumeUser,
    maxTokens: 4096,
  });

  const coverPromptConfig = loadCoverPromptConfig();
  const coverUser = fillTemplate(coverPromptConfig.userTemplate, {
    jobTitle: job.title,
    company: job.company,
    jobDescription: job.description ?? "",
  });
  const coverMd = await generateWithFallback({
    system: coverSystem,
    prompt: coverUser,
    maxTokens: 1024,
  });

  writeFileSync(resumePath_, resumeMd);
  writeFileSync(coverPath_, coverMd);

  const meta = {
    company: job.company,
    title: job.title,
    URL: job.url,
    site: job.site,
    searchId: job.searchId,
    jobId: job.jobId,
    idSource: job.idSource,
    status: "approved" as const,
    compensation: job.compensation ?? "",
    pay: job.compensation ?? "",
  };
  writeFileSync(join(jobDir, "meta.json"), JSON.stringify(meta, null, 2));

  if (job.description) {
    writeFileSync(join(jobDir, "job-description.md"), job.description);
  }

  return { jobDir, resumeMd, coverMd };
}
