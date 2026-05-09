import type { RunProxyConfig } from "network";

export interface ExtractedContent {
  title?: string | null;
  description?: string | null;
  author?: string | null;
  publisher?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  coverImageUrl?: string | null;
  htmlContent?: string | null;
  imageList: string[];
  platform: string;
  rawExtraction: Record<string, unknown>;
  adapterVersion: string;
  statusCode?: number | null;
  url?: string;
  imageReferer?: string;
}

export interface AdapterExtractInput {
  url: string;
  jobId: string;
  userId: string;
  abortSignal: AbortSignal;
  runProxy: RunProxyConfig;
}

export interface PlatformAdapter {
  id: string;
  version: string;
  priority: number;
  match(url: URL): boolean;
  extract(input: AdapterExtractInput): Promise<ExtractedContent>;
}
