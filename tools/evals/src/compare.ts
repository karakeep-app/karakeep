/**
 * Compare eval results across runs and models.
 *
 * Usage:
 *   npx tsx src/compare.ts                  # show latest run per model
 *   npx tsx src/compare.ts --all            # show all runs
 *   npx tsx src/compare.ts --model gpt-4.1-mini  # filter by model
 */
import * as fs from "fs";
import * as path from "path";

interface StoredSummary {
  timestamp: string;
  model: string;
  totalCases: number;
  passedCases: number;
  scores: Record<string, { mean: number; min: number }>;
}

interface StoredResult {
  summary: StoredSummary;
}

function loadResults(resultsDir: string): StoredResult[] {
  if (!fs.existsSync(resultsDir)) {
    return [];
  }

  const results: StoredResult[] = [];
  const modelDirs = fs.readdirSync(resultsDir);

  for (const modelDir of modelDirs) {
    const modelPath = path.join(resultsDir, modelDir);
    if (!fs.statSync(modelPath).isDirectory()) continue;

    const files = fs.readdirSync(modelPath).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(modelPath, file), "utf-8");
        results.push(JSON.parse(content));
      } catch {
        // skip malformed files
      }
    }
  }

  return results.sort(
    (a, b) =>
      new Date(a.summary.timestamp).getTime() -
      new Date(b.summary.timestamp).getTime(),
  );
}

function latestPerModel(results: StoredResult[]): StoredResult[] {
  const byModel = new Map<string, StoredResult>();
  for (const r of results) {
    byModel.set(r.summary.model, r);
  }
  return [...byModel.values()];
}

function printTable(results: StoredResult[]): void {
  if (results.length === 0) {
    console.log("No results found in tools/evals/results/");
    return;
  }

  // Collect all scorer names across all results
  const scorerNames = new Set<string>();
  for (const r of results) {
    for (const key of Object.keys(r.summary.scores)) {
      scorerNames.add(key);
    }
  }
  const scorers = [...scorerNames].sort();

  // Build header
  const cols = [
    { label: "Model", width: 20 },
    { label: "Timestamp", width: 20 },
    { label: "Pass", width: 8 },
    ...scorers.map((s) => ({ label: `${s} (avg/min)`, width: 16 })),
  ];

  const header = cols.map((c) => c.label.padEnd(c.width)).join("  ");
  const separator = cols.map((c) => "-".repeat(c.width)).join("  ");

  console.log();
  console.log(header);
  console.log(separator);

  for (const r of results) {
    const s = r.summary;
    const row = [
      s.model.padEnd(20).slice(0, 20),
      s.timestamp.slice(0, 19).padEnd(20),
      `${s.passedCases}/${s.totalCases}`.padEnd(8),
      ...scorers.map((scorer) => {
        const score = s.scores[scorer];
        if (!score) return "—".padEnd(16);
        const mean = (score.mean * 100).toFixed(0) + "%";
        const min = (score.min * 100).toFixed(0) + "%";
        return `${mean} / ${min}`.padEnd(16);
      }),
    ];
    console.log(row.join("  "));
  }

  console.log();
}

// ── CLI ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const modelIdx = args.indexOf("--model");
const modelFilter = modelIdx !== -1 ? args[modelIdx + 1] : null;

const resultsDir = path.join(__dirname, "..", "results");
let results = loadResults(resultsDir);

if (modelFilter) {
  results = results.filter((r) => r.summary.model.includes(modelFilter));
}

if (!showAll) {
  results = latestPerModel(results);
}

console.log(
  showAll
    ? "All runs"
    : "Latest run per model" + (modelFilter ? ` (filter: ${modelFilter})` : ""),
);
printTable(results);
