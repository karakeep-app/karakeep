import type { EvalCaseResult } from "./runner";
import type { ScoreResult } from "./scorers";

export interface EvalSummary {
  timestamp: string;
  model: string;
  totalCases: number;
  passedCases: number;
  scores: {
    format: { mean: number; min: number };
    style: { mean: number; min: number };
    curated: { mean: number; min: number };
    relevance: { mean: number; min: number };
    language: { mean: number; min: number };
  };
}

function aggregateScores(scores: (ScoreResult | null)[]): {
  mean: number;
  min: number;
} {
  const valid = scores.filter((s): s is ScoreResult => s !== null);
  if (valid.length === 0) {
    return { mean: 1.0, min: 1.0 };
  }
  const values = valid.map((s) => s.score);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
  };
}

export function buildSummary(
  results: EvalCaseResult[],
  model: string,
): EvalSummary {
  const allPassed = results.every((r) => {
    const scores = r.scores;
    return (
      scores.format.passed &&
      scores.style.passed &&
      (!scores.curated || scores.curated.passed) &&
      scores.relevance.passed &&
      (!scores.language || scores.language.passed)
    );
  });

  return {
    timestamp: new Date().toISOString(),
    model,
    totalCases: results.length,
    passedCases: results.filter((r) => {
      const s = r.scores;
      return (
        s.format.passed &&
        s.style.passed &&
        (!s.curated || s.curated.passed) &&
        s.relevance.passed &&
        (!s.language || s.language.passed)
      );
    }).length,
    scores: {
      format: aggregateScores(results.map((r) => r.scores.format)),
      style: aggregateScores(results.map((r) => r.scores.style)),
      curated: aggregateScores(results.map((r) => r.scores.curated)),
      relevance: aggregateScores(results.map((r) => r.scores.relevance)),
      language: aggregateScores(results.map((r) => r.scores.language)),
    },
  };
}

export function printSummary(summary: EvalSummary): void {
  console.log("\n" + "=".repeat(70));
  console.log(`  TAGGING EVAL RESULTS — ${summary.model}`);
  console.log(`  ${summary.timestamp}`);
  console.log("=".repeat(70));
  console.log(`  Cases: ${summary.passedCases}/${summary.totalCases} passed\n`);

  const rows = [
    ["Scorer", "Mean", "Min"],
    ["Format", fmt(summary.scores.format.mean), fmt(summary.scores.format.min)],
    ["Style", fmt(summary.scores.style.mean), fmt(summary.scores.style.min)],
    [
      "Curated",
      fmt(summary.scores.curated.mean),
      fmt(summary.scores.curated.min),
    ],
    [
      "Relevance",
      fmt(summary.scores.relevance.mean),
      fmt(summary.scores.relevance.min),
    ],
    [
      "Language",
      fmt(summary.scores.language.mean),
      fmt(summary.scores.language.min),
    ],
  ];

  for (const [label, mean, min] of rows) {
    console.log(
      `  ${label.padEnd(12)} ${mean.padStart(6)}  ${min.padStart(6)}`,
    );
  }
  console.log("=".repeat(70) + "\n");
}

export function printCaseResult(result: EvalCaseResult): void {
  const { fixture, tags, scores } = result;
  const allPassed =
    scores.format.passed &&
    scores.style.passed &&
    (!scores.curated || scores.curated.passed) &&
    scores.relevance.passed &&
    (!scores.language || scores.language.passed);

  const status = allPassed ? "PASS" : "FAIL";
  console.log(`  [${status}] ${fixture.id}: ${fixture.description}`);
  console.log(`         Tags: [${tags.join(", ")}]`);
  console.log(
    `         Format: ${fmt(scores.format.score)}  Style: ${fmt(scores.style.score)}  Relevance: ${fmt(scores.relevance.score)}`,
  );

  if (scores.curated) {
    console.log(
      `         Curated: ${fmt(scores.curated.score)} — ${scores.curated.explanation}`,
    );
  }
  if (scores.language) {
    console.log(
      `         Language: ${fmt(scores.language.score)} — ${scores.language.explanation}`,
    );
  }
  if (!allPassed) {
    const failed = [
      !scores.format.passed && `Format: ${scores.format.explanation}`,
      !scores.style.passed && `Style: ${scores.style.explanation}`,
      scores.curated &&
        !scores.curated.passed &&
        `Curated: ${scores.curated.explanation}`,
      !scores.relevance.passed && `Relevance: ${scores.relevance.explanation}`,
      scores.language &&
        !scores.language.passed &&
        `Language: ${scores.language.explanation}`,
    ].filter(Boolean);
    for (const msg of failed) {
      console.log(`         !! ${msg}`);
    }
  }
}

function fmt(n: number): string {
  return (n * 100).toFixed(0) + "%";
}
