/**
 * Job memory tests: applied list, opened PRs, 4-hour window, caps (plan: Option A, applied-jobs.json, 30 per site per 4h).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadAppliedJobs,
  loadOpenedPrs,
  saveAppliedJobs,
  addOpenedPr,
  addAppliedJob,
  isInAppliedList,
  countInWindow,
  canApplyMore,
  canOpenMorePrs,
  WINDOW_MS,
  getAppliedJobsPath,
} from "../src/state/memory.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AppliedJobEntry } from "../src/types.js";
import type { Site } from "../src/types.js";

const origCwd = process.cwd();
let tmpDir: string;

function setupTempDir() {
  tmpDir = join(tmpdir(), `applicator-memory-${Date.now()}`);
  mkdirSync(join(tmpDir, "input"), { recursive: true });
  writeFileSync(
    join(tmpDir, "input", "applied-jobs.json"),
    JSON.stringify({ applied: [], openedPrs: [] }, null, 2)
  );
  process.chdir(tmpDir);
}

describe("memory", () => {
  beforeEach(setupTempDir);
  afterEach(() => process.chdir(origCwd));

  it("loadAppliedJobs returns empty array when file has no applied entries", () => {
    expect(loadAppliedJobs()).toEqual([]);
  });

  it("loadOpenedPrs returns empty array when file has no openedPrs", () => {
    expect(loadOpenedPrs()).toEqual([]);
  });

  it("saveAppliedJobs persists applied list and preserves openedPrs", () => {
    const entries: AppliedJobEntry[] = [
      {
        site: "linkedin",
        jobId: "j1",
        role: "Engineer",
        company: "Acme",
        url: "https://linkedin.com/jobs/j1",
        appliedAt: new Date().toISOString(),
      },
    ];
    saveAppliedJobs(entries);
    expect(loadAppliedJobs()).toHaveLength(1);
    expect(loadAppliedJobs()[0].jobId).toBe("j1");
    expect(loadOpenedPrs()).toEqual([]);
  });

  it("addOpenedPr appends to openedPrs and persists", () => {
    addOpenedPr("linkedin" as Site, "job-123");
    const prs = loadOpenedPrs();
    expect(prs).toHaveLength(1);
    expect(prs[0].site).toBe("linkedin");
    expect(prs[0].jobId).toBe("job-123");
    expect(prs[0].openedAt).toBeDefined();
  });

  it("addAppliedJob appends entry and persists to file", () => {
    const applied = loadAppliedJobs();
    const entry: AppliedJobEntry = {
      site: "indeed",
      jobId: "ij1",
      role: "Dev",
      company: "Co",
      url: "https://indeed.com/ij1",
      appliedAt: new Date().toISOString(),
    };
    const next = addAppliedJob(applied, entry);
    expect(next).toHaveLength(1);
    expect(loadAppliedJobs()).toHaveLength(1);
    expect(loadAppliedJobs()[0].jobId).toBe("ij1");
  });

  it("isInAppliedList returns true when site+jobId match an entry", () => {
    const entries: AppliedJobEntry[] = [
      {
        site: "linkedin",
        jobId: "x",
        role: "R",
        company: "C",
        url: "u",
        appliedAt: new Date().toISOString(),
      },
    ];
    expect(isInAppliedList("linkedin", "x", entries)).toBe(true);
    expect(isInAppliedList("linkedin", "y", entries)).toBe(false);
    expect(isInAppliedList("indeed", "x", entries)).toBe(false);
  });

  it("countInWindow returns count of entries within window for given site", () => {
    const now = Date.now();
    const entries: AppliedJobEntry[] = [
      {
        site: "linkedin",
        jobId: "a",
        role: "R",
        company: "C",
        url: "u",
        appliedAt: new Date(now - 1000).toISOString(),
      },
      {
        site: "linkedin",
        jobId: "b",
        role: "R",
        company: "C",
        url: "u",
        appliedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        site: "indeed",
        jobId: "c",
        role: "R",
        company: "C",
        url: "u",
        appliedAt: new Date(now - 1000).toISOString(),
      },
    ];
    const windowMs = 4 * 60 * 60 * 1000;
    expect(countInWindow(entries, "linkedin", windowMs)).toBe(2);
    expect(countInWindow(entries, "indeed", windowMs)).toBe(1);
  });

  it("countInWindow excludes entries older than window", () => {
    const now = Date.now();
    const entries: AppliedJobEntry[] = [
      {
        site: "linkedin",
        jobId: "old",
        role: "R",
        company: "C",
        url: "u",
        appliedAt: new Date(now - (5 * 60 * 60 * 1000)).toISOString(),
      },
    ];
    expect(countInWindow(entries, "linkedin", WINDOW_MS)).toBe(0);
  });

  it("canApplyMore returns true when under max per site in window", () => {
    const entries: AppliedJobEntry[] = [];
    expect(canApplyMore(entries, "linkedin", 30, WINDOW_MS)).toBe(true);
  });

  it("canApplyMore returns false when at or over max per site in window", () => {
    const now = Date.now();
    const entries: AppliedJobEntry[] = Array.from({ length: 30 }, (_, i) => ({
      site: "linkedin" as Site,
      jobId: `j${i}`,
      role: "R",
      company: "C",
      url: "u",
      appliedAt: new Date(now - 1000).toISOString(),
    }));
    expect(canApplyMore(entries, "linkedin", 30, WINDOW_MS)).toBe(false);
    expect(canApplyMore(entries, "indeed", 30, WINDOW_MS)).toBe(true);
  });

  it("canOpenMorePrs returns false when opened PRs in window reach max", () => {
    const path = getAppliedJobsPath();
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 1000).toISOString();
    const openedPrs = [
      ...Array.from({ length: 30 }, () => ({
        site: "linkedin",
        jobId: `pr-${Math.random()}`,
        openedAt: recent,
      })),
    ];
    writeFileSync(
      path,
      JSON.stringify({ applied: [], openedPrs }, null, 2)
    );
    expect(canOpenMorePrs("linkedin", 30, WINDOW_MS)).toBe(false);
  });

  it("WINDOW_MS equals 4 hours in milliseconds", () => {
    expect(WINDOW_MS).toBe(4 * 60 * 60 * 1000);
  });
});
