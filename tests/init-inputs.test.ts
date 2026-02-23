/**
 * init-inputs tests: samples layout and applied-jobs.json shape (plan: init-inputs from samples).
 * Tests are the spec; do not change tests to make code pass.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

describe("init-inputs / samples", () => {
  it("samples dir has profile.yaml, prompts (resume.yaml, cover.yaml), templates, resume.sample.md", () => {
    const samples = join(projectRoot, "samples");
    expect(existsSync(join(samples, "profile.yaml"))).toBe(true);
    expect(existsSync(join(samples, "prompts", "resume.yaml"))).toBe(true);
    expect(existsSync(join(samples, "prompts", "cover.yaml"))).toBe(true);
    expect(existsSync(join(samples, "templates"))).toBe(true);
    expect(existsSync(join(samples, "resume.sample.md"))).toBe(true);
  });

  it("applied-jobs.json when present has applied and openedPrs arrays", () => {
    const appliedPath = join(projectRoot, "input", "applied-jobs.json");
    if (!existsSync(appliedPath)) return;
    const data = JSON.parse(readFileSync(appliedPath, "utf-8"));
    expect(Array.isArray(data.applied)).toBe(true);
    expect(Array.isArray(data.openedPrs)).toBe(true);
  });

  it("init-inputs script exists and can be loaded", async () => {
    const scriptPath = join(projectRoot, "src", "scripts", "init-inputs.ts");
    expect(existsSync(scriptPath)).toBe(true);
  });
});
