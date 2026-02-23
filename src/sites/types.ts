import type { Job, Site } from "../types.js";
import type { SearchConfig } from "../types.js";

export interface SiteSearchResult {
  jobs: Job[];
  hasMore: boolean;
}

export interface BuildSearchUrlOptions {
  search: SearchConfig;
  site: Site;
}
