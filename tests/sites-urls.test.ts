/**
 * Site search URL tests: buildSearchUrl for LinkedIn, Indeed, Greenhouse with urlParams (plan: URL params for newest jobs).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect } from "vitest";
import { buildSearchUrl as buildLinkedInSearchUrl } from "../src/sites/linkedin/search.js";
import { buildSearchUrl as buildIndeedSearchUrl } from "../src/sites/indeed/search.js";
import { buildSearchUrl as buildGreenhouseSearchUrl } from "../src/sites/greenhouse/search.js";
import type { SearchConfig } from "../src/types.js";

describe("buildLinkedInSearchUrl", () => {
  it("includes keywords and location in base search URL", () => {
    const search: SearchConfig = {
      id: "s1",
      keywords: "software engineer",
      location: "San Francisco",
    };
    const url = buildLinkedInSearchUrl(search, "San Francisco");
    expect(url).toContain("linkedin.com/jobs/search");
    expect(url).toContain("keywords=software+engineer");
    expect(url).toContain("location=San+Francisco");
  });

  it("merges urlParams.linkedin into query (e.g. f_TPR for newest)", () => {
    const search: SearchConfig = {
      id: "s1",
      keywords: "dev",
      location: "NYC",
      urlParams: { linkedin: { f_TPR: "r604800" } },
    };
    const url = buildLinkedInSearchUrl(search, "NYC");
    expect(url).toContain("f_TPR=r604800");
  });
});

describe("buildIndeedSearchUrl", () => {
  it("builds Indeed jobs URL with encoded q and l", () => {
    const search: SearchConfig = {
      id: "s1",
      keywords: "front end",
      location: "Los Angeles",
    };
    const url = buildIndeedSearchUrl(search, "Los Angeles");
    expect(url).toContain("indeed.com/jobs");
    expect(url).toContain("q=");
    expect(url).toContain("l=");
  });
});

describe("buildGreenhouseSearchUrl", () => {
  it("uses greenhouse board embed URL and sets for from keywords", () => {
    const search: SearchConfig = {
      id: "s1",
      keywords: "engineer",
      location: "Remote",
      urlParams: { greenhouse: { company: "acme" } },
    };
    const url = buildGreenhouseSearchUrl(search, "Remote");
    expect(url).toContain("boards.greenhouse.io");
    expect(url).toContain("for=engineer");
    expect(url).toContain("company=acme");
  });
});
