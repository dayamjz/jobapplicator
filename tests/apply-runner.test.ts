/**
 * Apply runner tests: findApprovedJobs returns only non-applied, not-in-memory, approved jobs; runApplyLoop respects 4h cap (plan: apply for merged jobs only).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findApprovedJobs, type JobFolder } from "../src/apply/runner.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const origCwd = process.cwd();
let tmpDir: string;

describe("findApprovedJobs", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `applicator-apply-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, "input"), { recursive: true });
    writeFileSync(
      join(tmpDir, "input", "applied-jobs.json"),
      JSON.stringify({ applied: [], openedPrs: [] }, null, 2)
    );
    process.chdir(tmpDir);
  });

  afterEach(() => process.chdir(origCwd));

  it("returns empty array when jobs dir does not exist", () => {
    expect(findApprovedJobs()).toEqual([]);
  });

  it("returns only jobs that have meta.json with status !== applied and not in applied list", () => {
    const jobsRoot = join(tmpDir, "jobs");
    mkdirSync(join(jobsRoot, "engineer", "job-1"), { recursive: true });
    mkdirSync(join(jobsRoot, "engineer", "job-2"), { recursive: true });
    writeFileSync(
      join(jobsRoot, "engineer", "job-1", "meta.json"),
      JSON.stringify({
        company: "A",
        title: "Eng",
        URL: "https://a.com/1",
        site: "linkedin",
        searchId: "s1",
        jobId: "job-1",
        idSource: "from_posting",
        status: "approved",
      })
    );
    writeFileSync(
      join(jobsRoot, "engineer", "job-2", "meta.json"),
      JSON.stringify({
        company: "B",
        title: "Eng",
        URL: "https://b.com/2",
        site: "linkedin",
        searchId: "s1",
        jobId: "job-2",
        idSource: "from_posting",
        status: "applied",
      })
    );
    writeFileSync(join(jobsRoot, "engineer", "job-1", "resume.md"), "");
    writeFileSync(join(jobsRoot, "engineer", "job-1", "cover.md"), "");
    const list = findApprovedJobs();
    const ids = list.map((j) => j.jobId).sort();
    expect(ids).toEqual(["job-1"]);
    expect(list.every((j) => j.status !== "applied")).toBe(true);
  });

  it("does not return jobs that are in the applied list (same site + jobId)", () => {
    const jobsRoot = join(tmpDir, "jobs");
    mkdirSync(join(jobsRoot, "eng", "already-applied"), { recursive: true });
    writeFileSync(
      join(jobsRoot, "eng", "already-applied", "meta.json"),
      JSON.stringify({
        company: "C",
        title: "Eng",
        URL: "https://c.com",
        site: "indeed",
        searchId: "s1",
        jobId: "already-applied",
        idSource: "from_posting",
        status: "approved",
      })
    );
    writeFileSync(join(tmpDir, "input", "applied-jobs.json"), JSON.stringify({
      applied: [
        {
          site: "indeed",
          jobId: "already-applied",
          role: "Eng",
          company: "C",
          url: "https://c.com",
          appliedAt: new Date().toISOString(),
        },
      ],
      openedPrs: [],
    }, null, 2));
    const list = findApprovedJobs();
    expect(list.map((j) => j.jobId)).not.toContain("already-applied");
  });

  it("returns JobFolder with site, jobId, role, company, url, path, status", () => {
    const jobsRoot = join(tmpDir, "jobs");
    mkdirSync(join(jobsRoot, "role", "j1"), { recursive: true });
    writeFileSync(
      join(jobsRoot, "role", "j1", "meta.json"),
      JSON.stringify({
        company: "Co",
        title: "Role Title",
        URL: "https://example.com/j",
        site: "greenhouse",
        searchId: "s1",
        jobId: "j1",
        idSource: "from_posting",
        status: "approved",
      })
    );
    writeFileSync(join(jobsRoot, "role", "j1", "resume.md"), "");
    writeFileSync(join(jobsRoot, "role", "j1", "cover.md"), "");
    const list = findApprovedJobs();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const folder = list.find((j) => j.jobId === "j1") as JobFolder;
    expect(folder.site).toBe("greenhouse");
    expect(folder.jobId).toBe("j1");
    expect(folder.role).toBe("Role Title");
    expect(folder.company).toBe("Co");
    expect(folder.url).toBe("https://example.com/j");
    expect(folder.path).toContain("jobs");
    expect(folder.path).toContain("j1");
    expect(folder.status).toBe("approved");
  });

  it("only includes jobs with status approved (PR merged); excludes pending_review from apply list", () => {
    const jobsRoot = join(tmpDir, "jobs");
    mkdirSync(join(jobsRoot, "r", "pending"), { recursive: true });
    mkdirSync(join(jobsRoot, "r", "approved"), { recursive: true });
    for (const [dir, status] of [["pending", "pending_review"], ["approved", "approved"]] as const) {
      writeFileSync(
        join(jobsRoot, "r", dir, "meta.json"),
        JSON.stringify({
          company: "X",
          title: "R",
          URL: "https://x.com",
          site: "linkedin",
          searchId: "s1",
          jobId: dir,
          idSource: "from_posting",
          status,
        })
      );
      writeFileSync(join(jobsRoot, "r", dir, "resume.md"), "");
      writeFileSync(join(jobsRoot, "r", dir, "cover.md"), "");
    }
    const list = findApprovedJobs();
    const ids = list.map((j) => j.jobId);
    expect(ids).toContain("approved");
    expect(ids).not.toContain("pending");
  });
});
