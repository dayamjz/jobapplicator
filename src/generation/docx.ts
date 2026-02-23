/**
 * Parse base .docx or .md resume to extract structure (section headings and order).
 * Structure is passed to generation so tailored resume matches the original.
 */
import mammoth from "mammoth";
import { readFileSync } from "fs";
import { resolve } from "path";

export interface ResumeStructure {
  headings: string[];
  rawHtml?: string;
  rawText: string;
}

export async function extractResumeStructure(resumePath: string): Promise<ResumeStructure> {
  const abs = resolve(process.cwd(), resumePath);
  const ext = abs.toLowerCase().slice(-5);
  if (ext.endsWith(".md")) {
    return extractStructureFromMarkdown(abs);
  }
  return extractStructureFromDocx(abs);
}

async function extractStructureFromDocx(abs: string): Promise<ResumeStructure> {
  const buffer = readFileSync(abs);
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;
  const text = result.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const headings: string[] = [];
  const headingRegex = /<h(\d)[^>]*>([^<]+)<\/h\d>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(html)) !== null) {
    headings.push(m[2].trim());
  }
  if (headings.length === 0) {
    headings.push("Experience", "Education", "Skills");
  }
  return { headings, rawHtml: html, rawText: text };
}

function extractStructureFromMarkdown(abs: string): ResumeStructure {
  const raw = readFileSync(abs, "utf-8");
  const headings: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#+\s+(.+)$/);
    if (match) headings.push(match[1].trim());
  }
  if (headings.length === 0) {
    headings.push("Experience", "Education", "Skills");
  }
  return { headings, rawText: raw.replace(/\s+/g, " ").trim() };
}

/**
 * Get structure as a string for the LLM prompt (preserve order).
 */
export function structureToPrompt(structure: ResumeStructure): string {
  if (structure.headings.length > 0) {
    return structure.headings.map((h, i) => `${i + 1}. ${h}`).join("\n");
  }
  return "Sections: Experience, Education, Skills (or infer from content)";
}
