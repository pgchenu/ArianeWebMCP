import type { Juridiction, Classification, DecisionMetadata } from "./decision.js";

export interface SearchParams {
  query: string;
  jurisdiction?: Juridiction | "CE+TC";
  classification?: Classification | "AB";
  date_start?: string;
  date_end?: string;
  page?: number;
  page_size?: number;
}

export interface SearchResult {
  total: number;
  page: number;
  page_size: number;
  decisions: DecisionMetadata[];
  fallback?: boolean;
}
