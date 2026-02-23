/**
 * Convert resume.md to DOCX for upload to application forms.
 * Falls back to the original resume file if conversion fails.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import * as docx from "docx";

const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx as any;

export async function convertMdToDocx(mdPath: string, outPath: string): Promise<string> {
  const md = readFileSync(mdPath, "utf-8");
  const lines = md.split(/\r?\n/);
  const children: any[] = [];

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (h1) {
      children.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 }));
    } else if (h2) {
      children.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 }));
    } else if (h3) {
      children.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 }));
    } else if (bullet) {
      children.push(new Paragraph({
        children: [new TextRun(bullet[1])],
        bullet: { level: 0 },
      }));
    } else if (line.trim()) {
      const runs: any[] = [];
      let remaining = line;
      const boldRegex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = boldRegex.exec(remaining)) !== null) {
        if (match.index > lastIndex) {
          runs.push(new TextRun(remaining.slice(lastIndex, match.index)));
        }
        runs.push(new TextRun({ text: match[1], bold: true }));
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < remaining.length) {
        runs.push(new TextRun(remaining.slice(lastIndex)));
      }
      children.push(new Paragraph({ children: runs.length > 0 ? runs : [new TextRun(line)] }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(outPath, buffer);
  return outPath;
}

export async function getResumeForUpload(jobDir: string, originalResumePath: string): Promise<string> {
  const mdPath = join(jobDir, "resume.md");
  const docxPath = join(jobDir, "resume.docx");

  if (existsSync(docxPath)) return docxPath;

  if (existsSync(mdPath)) {
    try {
      return await convertMdToDocx(mdPath, docxPath);
    } catch (err) {
      console.warn("  DOCX conversion failed, using original resume:", (err as Error).message);
    }
  }

  const absOriginal = join(process.cwd(), originalResumePath);
  if (existsSync(absOriginal)) return absOriginal;

  throw new Error(`No resume file available for upload in ${jobDir}`);
}
