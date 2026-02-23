/**
 * Ralph loop tests: runSiteLoop respects PR cap and job memory; returns stoppedReason (plan: 30 PRs per site per 4h, skip applied/opened).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runSiteLoop } from "../src/ralph/loop.js";
import { resetCache } from "../src/state/memory.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const origCwd = process.cwd();
let tmpDir: string;

vi.mock("../src/config/load.js", () => ({
  loadConfig: vi.fn(() => ({
    resumePath: "input/resume.md",
    rateLimitWindowHours: 4,
    maxPrsPerSitePerWindow: 30,
    maxApplicationsPerSitePerWindow: 30,
    delays: { pageLoadMs: [0, 0], formFieldMs: [0, 0], betweenApplicationsMs: [0, 0], searchResultClickMs: [0, 0] },
    applySchedule: "0 */4 * * *",
    searches: [],
  })),
}));

vi.mock("../src/sites/linkedin/search.js", () => ({
  searchLinkedIn: vi.fn().mockResolvedValue({ jobs: [], hasMore: false }),
}));
vi.mock("../src/sites/indeed/search.js", () => ({
  searchIndeed: vi.fn().mockResolvedValue({ jobs: [], hasMore: false }),
}));
vi.mock("../src/sites/greenhouse/search.js", () => ({
  searchGreenhouse: vi.fn().mockResolvedValue({ jobs: [], hasMore: false }),
}));
vi.mock("../src/generation/generate.js", () => ({
  generateForJob: vi.fn().mockResolvedValue({ jobDir: "/tmp/j", resumeMd: "", coverMd: "" }),
}));
vi.mock("../src/state/github.js", () => ({
  openPrForJob: vi.fn().mockResolvedValue(undefined),
}));

describe("runSiteLoop", () => {
  beforeEach(() => {
    resetCache();
    tmpDir = join(tmpdir(), `applicator-ralph-${Date.now()}`);
    mkdirSync(join(tmpDir, "input"), { recursive: true });
    writeFileSync(
      join(tmpDir, "input", "applied-jobs.json"),
      JSON.stringify({ applied: [], openedPrs: [] }, null, 2)
    );
    process.chdir(tmpDir);
  });

  afterEach(() => {
    resetCache();
    process.chdir(origCwd);
  });

  it("returns processed 0 and stoppedReason rate_limit_4h when opened PRs in window already at max", async () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    const openedPrs = Array.from({ length: 30 }, (_, i) => ({
      site: "linkedin",
      jobId: `pr-${i}`,
      openedAt: recent,
    }));
    writeFileSync(
      join(tmpDir, "input", "applied-jobs.json"),
      JSON.stringify({ applied: [], openedPrs }, null, 2)
    );

    const result = await runSiteLoop("linkedin", "s1", {
      id: "s1",
      keywords: "dev",
      location: "NYC",
    }, "NYC");

    expect(result.processed).toBe(0);
    expect(result.stoppedReason).toBe("rate_limit_4h");
  });
});
