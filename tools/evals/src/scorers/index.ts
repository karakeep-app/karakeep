export interface ScoreResult {
  /** Score between 0.0 and 1.0 */
  score: number;
  /** Whether the score meets the passing threshold */
  passed: boolean;
  /** Human-readable explanation */
  explanation: string;
}

export { scoreCurated } from "./curated";
export { scoreFormat } from "./format";
export { scoreLanguage } from "./language";
export { scoreEmpty, scoreRelevance } from "./relevance";
export { scoreStyle } from "./style";
