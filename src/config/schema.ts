import { z } from "zod";

const site = z.enum(["linkedin", "indeed", "greenhouse"]);

const delayRange = z.tuple([z.number().min(0), z.number().min(0)]);

export const delayConfigSchema = z.object({
  pageLoadMs: delayRange,
  formFieldMs: delayRange,
  betweenApplicationsMs: delayRange,
  searchResultClickMs: delayRange,
});

export const searchConfigSchema = z.object({
  id: z.string().min(1),
  keywords: z.string(),
  location: z.string(),
  urlParams: z
    .object({
      linkedin: z.record(z.string()).optional(),
      indeed: z.record(z.string()).optional(),
      greenhouse: z.record(z.string()).optional(),
    })
    .optional(),
});

export const runConfigSchema = z.object({
  resumePath: z.string().min(1),
  rateLimitWindowHours: z.number().min(1).default(4),
  maxPrsPerSitePerWindow: z.number().min(1).max(100).default(30),
  maxApplicationsPerSitePerWindow: z.number().min(1).max(100).default(30),
  delays: delayConfigSchema.default({
    pageLoadMs: [1000, 3000],
    formFieldMs: [200, 800],
    betweenApplicationsMs: [5000, 15000],
    searchResultClickMs: [1000, 2000],
  }),
  applySchedule: z.string().default("0 */4 * * *"),
  searches: z.array(searchConfigSchema).min(1),
});

export type RunConfigSchema = z.infer<typeof runConfigSchema>;
export type SearchConfigSchema = z.infer<typeof searchConfigSchema>;
