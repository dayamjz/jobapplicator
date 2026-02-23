/**
 * Generation tests: generateForJob writes jobs/<role>/<jobId> with resume.md, cover.md, meta.json, job-description.md (plan: one folder per job, md+docx).
 * LLM is mocked; tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateForJob } from "../src/generation/generate.js";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Job } from "../src/types.js";
import type { RunConfig } from "../src/types.js";

vi.mock("../src/llm/router.js", () => ({
  generateWithFallback: vi.fn().mockResolvedValue("Generated content"),
}));

const origCwd = process.cwd();
let tmpDir: string;

const sampleJob: Job = {
  site: "linkedin",
  jobId: "test-job-123",
  idSource: "from_posting",
  title: "Software Engineer",
  company: "Acme Inc",
  url: "https://linkedin.com/jobs/test-job-123",
  description: "Job description here",
  compensation: "$100k",
  searchId: "s1",
  role: "Software Engineer",
};

const sampleConfig: RunConfig = {
  resumePath: "input/resume.md",
  rateLimitWindowHours: 4,
  maxPrsPerSitePerWindow: 30,
  maxApplicationsPerSitePerWindow: 30,
  delays: {
    pageLoadMs: [1000, 3000],
    formFieldMs: [200, 800],
    betweenApplicationsMs: [5000, 15000],
    searchResultClickMs: [1000, 2000],
  },
  applySchedule: "0 */4 * * *",
  searches: [],
};

describe("generateForJob", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `applicator-gen-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, "input", "prompts"), { recursive: true });
    process.chdir(tmpDir);
    writeFileSync(join(tmpDir, "input", "resume.md"), "# Experience\n\nContent");
    writeFileSync(join(tmpDir, "input", "prompts", "resume.yaml"), "system: S\nuserTemplate: T");
    writeFileSync(join(tmpDir, "input", "prompts", "cover.yaml"), "system: S\nuserTemplate: T");
  });

  afterEach(() => process.chdir(origCwd));

  it("creates job dir under jobs/<role-slug>/<jobId>", async () => {
    const result = await generateForJob(sampleJob, sampleConfig.resumePath, sampleConfig);
    expect(result.jobDir).toContain("jobs");
    expect(result.jobDir).toContain("software-engineer");
    expect(result.jobDir).toContain("test-job-123");
    expect(existsSync(result.jobDir)).toBe(true);
  });

  it("writes resume.md and cover.md in job dir", async () => {
    await generateForJob(sampleJob, sampleConfig.resumePath, sampleConfig);
    const jobDir = join(tmpDir, "jobs", "software-engineer", "test-job-123");
    expect(existsSync(join(jobDir, "resume.md"))).toBe(true);
    expect(existsSync(join(jobDir, "cover.md"))).toBe(true);
    expect(readFileSync(join(jobDir, "resume.md"), "utf-8")).toBe("Generated content");
    expect(readFileSync(join(jobDir, "cover.md"), "utf-8")).toBe("Generated content");
  });

  it("writes meta.json with company, title, URL, site, searchId, jobId, idSource, status pending_review, compensation", async () => {
    await generateForJob(sampleJob, sampleConfig.resumePath, sampleConfig);
    const metaPath = join(tmpDir, "jobs", "software-engineer", "test-job-123", "meta.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(meta.company).toBe("Acme Inc");
    expect(meta.title).toBe("Software Engineer");
    expect(meta.URL).toBe(sampleJob.url);
    expect(meta.site).toBe("linkedin");
    expect(meta.searchId).toBe("s1");
    expect(meta.jobId).toBe("test-job-123");
    expect(meta.idSource).toBe("from_posting");
    expect(meta.status).toBe("pending_review");
    expect(meta.compensation).toBe("$100k");
  });

  it("writes job-description.md when job has description", async () => {
    await generateForJob(sampleJob, sampleConfig.resumePath, sampleConfig);
    const descPath = join(tmpDir, "jobs", "software-engineer", "test-job-123", "job-description.md");
    expect(existsSync(descPath)).toBe(true);
    expect(readFileSync(descPath, "utf-8")).toBe("Job description here");
  });

  it("returns GeneratedJobArtifacts with jobDir, resumeMd, coverMd", async () => {
    const result = await generateForJob(sampleJob, sampleConfig.resumePath, sampleConfig);
    expect(result.jobDir).toBeDefined();
    expect(result.resumeMd).toBe("Generated content");
    expect(result.coverMd).toBe("Generated content");
  });

  it("slugifies role for folder name (lowercase, hyphenated, truncated)", async () => {
    const jobWithLongRole: Job = { ...sampleJob, role: "Senior Staff Software Engineer" };
    await generateForJob(jobWithLongRole, sampleConfig.resumePath, sampleConfig);
    const base = join(tmpDir, "jobs");
    const roleDir = readdirSync(base)[0];
    expect(roleDir).toMatch(/^[a-z0-9-]+$/);
    expect(roleDir).toContain("software");
  });
});
