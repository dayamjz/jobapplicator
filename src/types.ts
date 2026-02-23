/**
 * Shared types for the job applicator.
 */

export type Site = "linkedin" | "indeed" | "greenhouse";

export interface RunConfig {
  resumePath: string;
  rateLimitWindowHours: number;
  maxPrsPerSitePerWindow: number;
  maxApplicationsPerSitePerWindow: number;
  delays: DelayConfig;
  applySchedule: string;
  dryRun: boolean;
  searches: SearchConfig[];
}

export interface DelayConfig {
  pageLoadMs: [number, number];
  formFieldMs: [number, number];
  betweenApplicationsMs: [number, number];
  searchResultClickMs: [number, number];
}

export interface SearchConfig {
  id: string;
  keywords: string;
  location: string | string[];
  urlParams?: Partial<Record<Site, Record<string, string>>>;
}

export function getLocations(search: SearchConfig): string[] {
  return Array.isArray(search.location) ? search.location : [search.location];
}

export interface Job {
  site: Site;
  jobId: string;
  idSource: "from_posting" | "site_prefixed";
  title: string;
  company: string;
  url: string;
  description?: string;
  compensation?: string;
  searchId: string;
  role: string;
}

export interface JobMeta {
  company: string;
  title: string;
  URL: string;
  site: Site;
  searchId: string;
  jobId: string;
  idSource: "from_posting" | "site_prefixed";
  status: "pending_review" | "approved" | "applied" | "needs_manual";
  compensation?: string;
  appliedAt?: string;
}

export interface AppliedJobEntry {
  site: Site;
  jobId: string;
  role: string;
  company: string;
  url: string;
  appliedAt: string;
}

export interface ProfileAnswers {
  [questionId: string]: string;
}

export interface QuestionTemplate {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  default?: string;
}
