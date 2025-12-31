export interface Bookmark {
  id: string;
  title: string | null;
  content: {
    type: string;
    title: string;
    url?: string;
    text?: string;
    htmlContent?: string;
    description?: string;
  };
  tags: Array<{ name: string; attachedBy?: "ai" | "human" }>;
}

export interface ModelConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
}

export interface ComparisonResult {
  bookmark: Bookmark;
  modelA: string;
  modelATags: string[];
  modelB: string;
  modelBTags: string[];
  winner?: "modelA" | "modelB" | "skip";
}

export interface FinalResults {
  model1Name: string;
  model2Name: string;
  model1Votes: number;
  model2Votes: number;
  skipped: number;
  errors: number;
  total: number;
}
