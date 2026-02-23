/**
 * Job memory: applied list and 4-hour window checks.
 * Cached in-memory after first load; flushed to disk only on writes.
 * Cache auto-invalidates when cwd changes (for tests).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
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

let _cache: AppliedJobsData | null = null;
let _cachePath: string | null = null;
let _cacheMtimeMs: number | null = null;
let _appliedSet: Set<string> | null = null;
let _openedPrSet: Set<string> | null = null;

function makeKey(site: string, jobId: string): string {
  return `${site}:${jobId}`;
}

function ensureLoaded(): AppliedJobsData {
  const path = getAppliedJobsPath();
  if (_cache && _cachePath === path && existsSync(path)) {
    const currentMtime = statSync(path).mtimeMs;
    if (_cacheMtimeMs === currentMtime) return _cache;
  }
  if (!existsSync(path)) {
    _cache = { applied: [], openedPrs: [] };
    _cacheMtimeMs = null;
  } else {
    _cache = JSON.parse(readFileSync(path, "utf-8")) as AppliedJobsData;
    _cache.openedPrs ??= [];
    _cacheMtimeMs = statSync(path).mtimeMs;
  }
  _cachePath = path;
  _appliedSet = new Set(_cache.applied.map((e) => makeKey(e.site, e.jobId)));
  _openedPrSet = new Set(_cache.openedPrs!.map((e) => makeKey(e.site, e.jobId)));
  return _cache;
}

function flushToDisk(): void {
  const data = ensureLoaded();
  const path = getAppliedJobsPath();
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  _cacheMtimeMs = statSync(path).mtimeMs;
}

export function resetCache(): void {
  _cache = null;
  _cachePath = null;
  _cacheMtimeMs = null;
  _appliedSet = null;
  _openedPrSet = null;
}

export function loadAppliedJobs(): AppliedJobEntry[] {
  return ensureLoaded().applied;
}

export function loadOpenedPrs(): OpenedPrEntry[] {
  return ensureLoaded().openedPrs!;
}

export function saveAppliedJobs(entries: AppliedJobEntry[], openedPrs?: OpenedPrEntry[]): void {
  const data = ensureLoaded();
  data.applied = entries;
  if (openedPrs !== undefined) data.openedPrs = openedPrs;
  _appliedSet = new Set(entries.map((e) => makeKey(e.site, e.jobId)));
  if (openedPrs) _openedPrSet = new Set(openedPrs.map((e) => makeKey(e.site, e.jobId)));
  flushToDisk();
}

export function addOpenedPr(site: Site, jobId: string): void {
  const data = ensureLoaded();
  data.openedPrs!.push({ site, jobId, openedAt: new Date().toISOString() });
  _openedPrSet!.add(makeKey(site, jobId));
  flushToDisk();
}

export function isInAppliedList(site: Site, jobId: string, entries?: AppliedJobEntry[]): boolean {
  if (entries) {
    return entries.some((e) => e.site === site && e.jobId === jobId);
  }
  ensureLoaded();
  return _appliedSet!.has(makeKey(site, jobId));
}

export function isInOpenedPrs(site: Site, jobId: string): boolean {
  ensureLoaded();
  return _openedPrSet!.has(makeKey(site, jobId));
}

export function countInWindow(entries: AppliedJobEntry[], site: Site, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return entries.filter((e) => e.site === site && new Date(e.appliedAt).getTime() >= cutoff).length;
}

export function canApplyMore(entries: AppliedJobEntry[], site: Site, maxPerSite: number, windowMs: number = WINDOW_MS): boolean {
  return countInWindow(entries, site, windowMs) < maxPerSite;
}

export function addAppliedJob(entries: AppliedJobEntry[], entry: AppliedJobEntry): AppliedJobEntry[] {
  const data = ensureLoaded();
  data.applied.push(entry);
  _appliedSet!.add(makeKey(entry.site, entry.jobId));
  flushToDisk();
  return data.applied;
}

export function canOpenMorePrs(site: Site, maxPerSite: number, windowMs: number = WINDOW_MS): boolean {
  const prs = loadOpenedPrs();
  const cutoff = Date.now() - windowMs;
  const count = prs.filter((e) => e.site === site && new Date(e.openedAt).getTime() >= cutoff).length;
  return count < maxPerSite;
}

export function countOpenedPrsInWindow(site: Site, windowMs: number = WINDOW_MS): number {
  const prs = loadOpenedPrs();
  const cutoff = Date.now() - windowMs;
  return prs.filter((e) => e.site === site && new Date(e.openedAt).getTime() >= cutoff).length;
}
