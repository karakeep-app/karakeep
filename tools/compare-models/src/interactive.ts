import * as readline from "node:readline";
import chalk from "chalk";

import type { ComparisonResult } from "./types";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export function displayComparison(
  index: number,
  total: number,
  result: ComparisonResult,
  blind: boolean = true,
): void {
  const divider = chalk.gray("─".repeat(80));
  const header = chalk.bold.cyan(`\n=== Bookmark ${index}/${total} ===`);
  const title = chalk.bold.white(result.bookmark.title || "Untitled");
  const url = result.bookmark.content.url
    ? chalk.gray(result.bookmark.content.url)
    : "";
  const content = chalk.gray(
    result.bookmark.content.description
      ? result.bookmark.content.description.substring(0, 200) + "..."
      : "",
  );

  const modelAName = blind ? "Model A" : result.modelA;
  const modelBName = blind ? "Model B" : result.modelB;

  const modelATags = result.modelATags
    .map((tag) => chalk.green(`  • ${tag}`))
    .join("\n");
  const modelBTags = result.modelBTags
    .map((tag) => chalk.yellow(`  • ${tag}`))
    .join("\n");

  console.log(header);
  console.log(title);
  if (url) console.log(url);
  if (content) console.log(content);
  console.log(divider);
  console.log();
  console.log(chalk.green(`${modelAName}:`));
  if (modelATags) {
    console.log(modelATags);
  } else {
    console.log(chalk.gray("  (no tags)"));
  }
  console.log();
  console.log(chalk.yellow(`${modelBName}:`));
  if (modelBTags) {
    console.log(modelBTags);
  } else {
    console.log(chalk.gray("  (no tags)"));
  }
  console.log();
}

export function displayError(message: string): void {
  console.log(chalk.red(`\n✗ Error: ${message}\n`));
}

export function displayProgress(message: string): void {
  process.stdout.write(chalk.gray(message));
}

export function clearProgress(): void {
  process.stdout.write("\r\x1b[K");
}

export function close(): void {
  rl.close();
}

export function displayFinalResults(results: {
  model1Name: string;
  model2Name: string;
  model1Votes: number;
  model2Votes: number;
  skipped: number;
  errors: number;
  total: number;
}): void {
  const winner =
    results.model1Votes > results.model2Votes
      ? results.model1Name
      : results.model2Votes > results.model1Votes
        ? results.model2Name
        : "TIE";

  const divider = chalk.gray("─".repeat(80));
  const header = chalk.bold.cyan("\n=== FINAL RESULTS ===");
  const model1Line = chalk.green(
    `${results.model1Name}: ${results.model1Votes} votes`,
  );
  const model2Line = chalk.yellow(
    `${results.model2Name}: ${results.model2Votes} votes`,
  );
  const skippedLine = chalk.gray(`Skipped: ${results.skipped}`);
  const errorsLine = chalk.red(`Errors: ${results.errors}`);
  const totalLine = chalk.bold(`Total bookmarks tested: ${results.total}`);
  const winnerLine =
    winner === "TIE"
      ? chalk.bold.cyan(`\n🏁 RESULT: TIE`)
      : chalk.bold.green(`\n🏆 WINNER: ${winner}`);

  console.log(divider);
  console.log(header);
  console.log(divider);
  console.log(model1Line);
  console.log(model2Line);
  console.log(skippedLine);
  console.log(errorsLine);
  console.log(divider);
  console.log(totalLine);
  console.log(winnerLine);
  console.log(divider);
}
