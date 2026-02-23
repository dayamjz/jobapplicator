/**
 * Prompt config tests: load resume/cover YAML, fillTemplate (plan: input/prompts, two prompt configs).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadResumePromptConfig,
  loadCoverPromptConfig,
  fillTemplate,
} from "../src/generation/prompts.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const origCwd = process.cwd();
let tmpDir: string;

describe("prompts", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `applicator-prompts-${Date.now()}`);
    mkdirSync(join(tmpDir, "input", "prompts"), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => process.chdir(origCwd));

  it("loadResumePromptConfig returns system and userTemplate from resume.yaml", () => {
    writeFileSync(
      join(tmpDir, "input", "prompts", "resume.yaml"),
      'system: Custom resume system\nuserTemplate: "Job: {{jobTitle}} at {{company}}"'
    );
    const config = loadResumePromptConfig();
    expect(config.system).toBe("Custom resume system");
    expect(config.userTemplate).toContain("{{jobTitle}}");
    expect(config.userTemplate).toContain("{{company}}");
  });

  it("loadResumePromptConfig returns defaults when file missing", () => {
    const config = loadResumePromptConfig();
    expect(config.system).toContain("resume");
    expect(config.userTemplate).toContain("{{jobDescription}}");
  });

  it("loadCoverPromptConfig returns system and userTemplate from cover.yaml", () => {
    writeFileSync(
      join(tmpDir, "input", "prompts", "cover.yaml"),
      "system: Cover writer\nuserTemplate: Apply to {{company}}"
    );
    const config = loadCoverPromptConfig();
    expect(config.system).toBe("Cover writer");
    expect(config.userTemplate).toContain("{{company}}");
  });

  it("fillTemplate replaces all {{key}} with value", () => {
    const out = fillTemplate("Hello {{name}}, job: {{job}}", {
      name: "Alice",
      job: "Engineer",
    });
    expect(out).toBe("Hello Alice, job: Engineer");
  });

  it("fillTemplate replaces multiple occurrences of same key", () => {
    const out = fillTemplate("{{x}} and {{x}}", { x: "same" });
    expect(out).toBe("same and same");
  });

  it("fillTemplate leaves unknown placeholders unchanged or empty", () => {
    const out = fillTemplate("{{a}} {{b}}", { a: "A" });
    expect(out).toBe("A ");
  });
});
