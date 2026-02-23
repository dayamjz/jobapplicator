/**
 * Resume structure tests: extractResumeStructure from .md (and structure shape), structureToPrompt (plan: docx/md, preserve section order).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractResumeStructure,
  structureToPrompt,
  type ResumeStructure,
} from "../src/generation/docx.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const origCwd = process.cwd();
let tmpDir: string;

describe("extractResumeStructure", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `applicator-docx-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => process.chdir(origCwd));

  it("extracts headings from markdown as # or ## lines in order", async () => {
    const mdPath = join(tmpDir, "resume.md");
    writeFileSync(
      mdPath,
      "# Experience\n\nWork history\n\n## Education\n\nSchool\n\n# Skills\n\nList"
    );
    const structure = await extractResumeStructure("resume.md");
    expect(structure.headings).toEqual(["Experience", "Education", "Skills"]);
    expect(structure.rawText).toBeDefined();
    expect(structure.rawText.length).toBeGreaterThan(0);
  });

  it("returns default headings when markdown has no # lines", async () => {
    writeFileSync(join(tmpDir, "flat.md"), "Just plain text.");
    const structure = await extractResumeStructure("flat.md");
    expect(structure.headings).toEqual(["Experience", "Education", "Skills"]);
  });

  it("returns structure with headings and rawText only for .md (no rawHtml)", async () => {
    writeFileSync(join(tmpDir, "r.md"), "# Summary\n\nContent");
    const structure = await extractResumeStructure("r.md");
    expect(structure).toMatchObject({
      headings: ["Summary"],
      rawText: expect.any(String),
    });
    expect(structure.rawHtml).toBeUndefined();
  });
});

describe("structureToPrompt", () => {
  it("formats headings as numbered list for prompt", () => {
    const structure: ResumeStructure = {
      headings: ["Experience", "Education", "Skills"],
      rawText: "some text",
    };
    expect(structureToPrompt(structure)).toBe(
      "1. Experience\n2. Education\n3. Skills"
    );
  });

  it("returns default section line when no headings", () => {
    const structure: ResumeStructure = { headings: [], rawText: "" };
    expect(structureToPrompt(structure)).toContain("Experience");
    expect(structureToPrompt(structure)).toContain("Education");
  });
});
