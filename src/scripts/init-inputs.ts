#!/usr/bin/env node
/**
 * Create input/ folder and copy sample files when empty.
 * Run: npm run init-inputs
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const inputDir = join(root, "input");
const samplesDir = join(root, "samples");

function copyIfMissing(src: string, dest: string, isDir = false) {
  if (existsSync(dest)) return;
  if (isDir) {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const s = join(src, e.name);
      const d = join(dest, e.name);
      copyIfMissing(s, d, e.isDirectory());
    }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    console.log("Created:", dest);
  }
}

async function main() {
  if (!existsSync(samplesDir)) {
    console.error("Samples directory not found:", samplesDir);
    process.exit(1);
  }
  mkdirSync(inputDir, { recursive: true });

  copyIfMissing(join(samplesDir, "profile.yaml"), join(inputDir, "profile.yaml"));
  copyIfMissing(join(samplesDir, "resume.sample.md"), join(inputDir, "resume.sample.md"));
  copyIfMissing(join(samplesDir, "prompts"), join(inputDir, "prompts"), true);
  copyIfMissing(join(samplesDir, "templates"), join(inputDir, "templates"), true);

  const appliedPath = join(inputDir, "applied-jobs.json");
  if (!existsSync(appliedPath)) {
    const { writeFileSync } = await import("fs");
    (writeFileSync as (path: string, data: string) => void)(appliedPath, JSON.stringify({ applied: [], openedPrs: [] }, null, 2));
    console.log("Created:", appliedPath);
  }

  console.log("\nInput folder ready. Next steps:");
  console.log("  1. Add your resume: copy input/resume.sample.md to input/resume.docx (or create resume.docx with your content)");
  console.log("  2. Edit input/profile.yaml with your answers");
  console.log("  3. Copy config.example.json to config.json and set resumePath to ./input/resume.docx");
  console.log("  4. Set env vars (see .env.example) and run: npm run dev -- search");
}

main();
