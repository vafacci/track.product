import type { FetchMode } from "@/db/schema";

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  /** Every URL visited, in order, starting with the requested one. */
  redirectChain: string[];
  status: number;
  html: string;
  mode: FetchMode;
}
