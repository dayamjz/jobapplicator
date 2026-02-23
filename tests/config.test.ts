/**
 * Config schema and load tests (plan: run config with resumePath, rate limits, delays, searches, urlParams).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runConfigSchema, searchConfigSchema } from "../src/config/schema.js";
import { loadConfig, getConfigPath } from "../src/config/load.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("runConfigSchema", () => {
  it("accepts valid config with resumePath, rate limits, delays, and at least one search", () => {
    const valid = {
      resumePath: "input/resume.docx",
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
      searches: [
        {
          id: "s1",
          keywords: "software engineer",
          location: "San Francisco",
          urlParams: {
            linkedin: { f_TPR: "r604800" },
            indeed: {},
            greenhouse: {},
          },
        },
      ],
    };
    const parsed = runConfigSchema.parse(valid);
    expect(parsed.resumePath).toBe("input/resume.docx");
    expect(parsed.rateLimitWindowHours).toBe(4);
    expect(parsed.maxPrsPerSitePerWindow).toBe(30);
    expect(parsed.searches).toHaveLength(1);
    expect(parsed.searches[0].urlParams?.linkedin?.f_TPR).toBe("r604800");
  });

  it("rejects missing resumePath", () => {
    const invalid = {
      searches: [{ id: "s1", keywords: "x", location: "y" }],
    };
    expect(() => runConfigSchema.parse(invalid)).toThrow();
  });

  it("rejects empty searches array", () => {
    const invalid = {
      resumePath: "input/resume.docx",
      searches: [],
    };
    expect(() => runConfigSchema.parse(invalid)).toThrow();
  });

  it("applies defaults for delays and applySchedule when omitted", () => {
    const minimal = {
      resumePath: "input/resume.docx",
      searches: [{ id: "s1", keywords: "x", location: "y" }],
    };
    const parsed = runConfigSchema.parse(minimal);
    expect(parsed.delays.pageLoadMs).toEqual([1000, 3000]);
    expect(parsed.applySchedule).toBe("0 */4 * * *");
  });

  it("rejects maxPrsPerSitePerWindow above 100", () => {
    const invalid = {
      resumePath: "input/resume.docx",
      maxPrsPerSitePerWindow: 101,
      searches: [{ id: "s1", keywords: "x", location: "y" }],
    };
    expect(() => runConfigSchema.parse(invalid)).toThrow();
  });
});

describe("searchConfigSchema", () => {
  it("accepts search with id, keywords, location and optional urlParams per site", () => {
    const search = {
      id: "greenhouse-acme",
      keywords: "engineer",
      location: "Remote",
      urlParams: {
        linkedin: { f_TPR: "r604800" },
        greenhouse: { company: "acme" },
      },
    };
    const parsed = searchConfigSchema.parse(search);
    expect(parsed.id).toBe("greenhouse-acme");
    expect(parsed.urlParams?.linkedin?.f_TPR).toBe("r604800");
    expect(parsed.urlParams?.greenhouse?.company).toBe("acme");
  });

  it("rejects empty id", () => {
    expect(() =>
      searchConfigSchema.parse({ id: "", keywords: "x", location: "y" })
    ).toThrow();
  });
});

describe("loadConfig", () => {
  const origCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `applicator-config-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
  });

  it("loads config from CONFIG_PATH or default config.json", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        resumePath: "input/resume.docx",
        searches: [{ id: "s1", keywords: "dev", location: "NYC" }],
      })
    );
    process.env.CONFIG_PATH = configPath;
    const config = loadConfig();
    expect(config.resumePath).toBe("input/resume.docx");
    expect(config.searches).toHaveLength(1);
    delete process.env.CONFIG_PATH;
  });

  it("uses default config path when CONFIG_PATH is not set", () => {
    const path = getConfigPath();
    expect(path).toBe(join(process.cwd(), "config.json"));
  });
});
