/**
 * Job memory: applied list and 4-hour window checks.
 * Stored in input/applied-jobs.json so it is versioned.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Site, AppliedJobEntry } from "../types.js";

const APPLIED_JOBS_FILE = "input/applied-jobs.json";
export const WINDOW_MS = 4 * 60 * 60 * 1000;

export function getAppliedJobsPath(): string {
  return join(process.cwd(), APPLIED_JOBS_FILE);
}

export interface OpenedPrEntry {
  site: Site;
  jobId: string;
  openedAt: string;
}

export interface AppliedJobsData {
  applied: AppliedJobEntry[];
  openedPrs?: OpenedPrEntry[];
}

export function loadAppliedJobs(): AppliedJobEntry[] {
  const path = getAppliedJobsPath();
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8")) as AppliedJobsData;
  return data.applied ?? [];
}

export function loadOpenedPrs(): OpenedPrEntry[] {
  const path = getAppliedJobsPath();
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8")) as AppliedJobsData;
  return data.openedPrs ?? [];
}

export function saveAppliedJobs(entries: AppliedJobEntry[], openedPrs?: OpenedPrEntry[]): void {
  const path = getAppliedJobsPath();
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data: AppliedJobsData = { applied: entries, openedPrs: openedPrs ?? loadOpenedPrs() };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function addOpenedPr(site: Site, jobId: string): void {
  const applied = loadAppliedJobs();
  const prs = loadOpenedPrs();
  prs.push({ site, jobId, openedAt: new Date().toISOString() });
  saveAppliedJobs(applied, prs);
}

export function isInAppliedList(site: Site, jobId: string, entries: AppliedJobEntry[]): boolean {
  return entries.some((e) => e.site === site && e.jobId === jobId);
}

export function countInWindow(entries: AppliedJobEntry[], site: Site, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return entries.filter((e) => e.site === site && new Date(e.appliedAt).getTime() >= cutoff).length;
}

export function canApplyMore(entries: AppliedJobEntry[], site: Site, maxPerSite: number, windowMs: number = WINDOW_MS): boolean {
  return countInWindow(entries, site, windowMs) < maxPerSite;
}

export function addAppliedJob(entries: AppliedJobEntry[], entry: AppliedJobEntry): AppliedJobEntry[] {
  const next = [...entries, entry];
  saveAppliedJobs(next, loadOpenedPrs());
  return next;
}

export function canOpenMorePrs(site: Site, maxPerSite: number, windowMs: number = WINDOW_MS): boolean {
  const prs = loadOpenedPrs();
  const cutoff = Date.now() - windowMs;
  const count = prs.filter((e) => e.site === site && new Date(e.openedAt).getTime() >= cutoff).length;
  return count < maxPerSite;
}
