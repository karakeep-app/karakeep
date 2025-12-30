import chalk from "chalk";

import type { ComparisonResult } from "./types";
import { KarakeepAPIClient } from "./apiClient";
import { runTaggingForModel } from "./bookmarkProcessor";
import { config } from "./config";
import { createInferenceClient } from "./inferenceClient";
import {
  askQuestion,
  clearProgress,
  close,
  displayComparison,
  displayError,
  displayFinalResults,
  displayProgress,
} from "./interactive";

interface VoteCounters {
  model1Votes: number;
  model2Votes: number;
  skipped: number;
  errors: number;
  total: number;
}

interface ShuffleResult {
  modelA: string;
  modelB: string;
  modelAIsModel1: boolean;
}

async function main() {
  console.log(chalk.cyan("\n🚀 Karakeep Model Comparison Tool\n"));

  const isExistingMode = config.COMPARISON_MODE === "model-vs-existing";

  if (isExistingMode) {
    console.log(
      chalk.yellow(
        `Mode: Comparing ${config.MODEL1_NAME} against existing AI tags\n`,
      ),
    );
  } else {
    if (!config.MODEL2_NAME) {
      console.log(
        chalk.red(
          "\n✗ Error: MODEL2_NAME is required for model-vs-model comparison mode\n",
        ),
      );
      process.exit(1);
    }
    console.log(
      chalk.yellow(
        `Mode: Comparing ${config.MODEL1_NAME} vs ${config.MODEL2_NAME}\n`,
      ),
    );
  }

  const apiClient = new KarakeepAPIClient();

  displayProgress("Fetching bookmarks from Karakeep...");
  let bookmarks = await apiClient.fetchBookmarks(config.COMPARE_LIMIT);
  clearProgress();

  // Filter bookmarks with AI tags if in existing mode
  if (isExistingMode) {
    bookmarks = bookmarks.filter(
      (b) => b.tags.some((t) => t.attachedBy === "ai"),
    );
    console.log(
      chalk.green(
        `✓ Fetched ${bookmarks.length} link bookmarks with existing AI tags\n`,
      ),
    );
  } else {
    console.log(chalk.green(`✓ Fetched ${bookmarks.length} link bookmarks\n`));
  }

  if (bookmarks.length === 0) {
    console.log(
      chalk.yellow(
        "\n⚠ No bookmarks found with AI tags. Please add some bookmarks with AI tags first.\n",
      ),
    );
    return;
  }

  const counters: VoteCounters = {
    model1Votes: 0,
    model2Votes: 0,
    skipped: 0,
    errors: 0,
    total: bookmarks.length,
  };

  const detailedResults: ComparisonResult[] = [];

  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];

    displayProgress(
      `[${i + 1}/${bookmarks.length}] Running inference on: ${bookmark.title || bookmark.content.title || "Untitled"}`,
    );

    let model1Tags: string[] = [];
    let model2Tags: string[] = [];

    // Get tags for model 1 (new model)
    try {
      const model1Client = createInferenceClient(config.MODEL1_NAME);
      model1Tags = await runTaggingForModel(
        bookmark,
        model1Client,
        "english",
        config.INFERENCE_CONTEXT_LENGTH,
      );
    } catch (error) {
      clearProgress();
      displayError(
        `${config.MODEL1_NAME} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      counters.errors++;
      continue;
    }

    // Get tags for model 2 or existing AI tags
    if (isExistingMode) {
      // Use existing AI tags from the bookmark
      model2Tags = bookmark.tags
        .filter((t) => t.attachedBy === "ai")
        .map((t) => t.name);
    } else {
      // Run inference with model 2
      try {
        const model2Client = createInferenceClient(config.MODEL2_NAME!);
        model2Tags = await runTaggingForModel(
          bookmark,
          model2Client,
          "english",
          config.INFERENCE_CONTEXT_LENGTH,
        );
      } catch (error) {
        clearProgress();
        displayError(
          `${config.MODEL2_NAME} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        counters.errors++;
        continue;
      }
    }

    clearProgress();

    const model2Label = isExistingMode
      ? "Existing AI Tags"
      : config.MODEL2_NAME!;

    const shuffleResult: ShuffleResult = {
      modelA: config.MODEL1_NAME,
      modelB: model2Label,
      modelAIsModel1: Math.random() < 0.5,
    };

    if (!shuffleResult.modelAIsModel1) {
      shuffleResult.modelA = model2Label;
      shuffleResult.modelB = config.MODEL1_NAME;
    }

    const comparison: ComparisonResult = {
      bookmark,
      modelA: shuffleResult.modelA,
      modelATags: shuffleResult.modelAIsModel1 ? model1Tags : model2Tags,
      modelB: shuffleResult.modelB,
      modelBTags: shuffleResult.modelAIsModel1 ? model2Tags : model1Tags,
    };

    displayComparison(i + 1, bookmarks.length, comparison, true);

    const answer = await askQuestion(
      "Which tags do you prefer? [1=Model A, 2=Model B, s=skip, q=quit] > ",
    );

    const normalizedAnswer = answer.toLowerCase();

    if (normalizedAnswer === "q" || normalizedAnswer === "quit") {
      console.log(chalk.yellow("\n⏸ Quitting early...\n"));
      break;
    }

    if (normalizedAnswer === "1") {
      comparison.winner = "modelA";
      if (shuffleResult.modelAIsModel1) {
        counters.model1Votes++;
      } else {
        counters.model2Votes++;
      }
      detailedResults.push(comparison);
    } else if (normalizedAnswer === "2") {
      comparison.winner = "modelB";
      if (shuffleResult.modelAIsModel1) {
        counters.model2Votes++;
      } else {
        counters.model1Votes++;
      }
      detailedResults.push(comparison);
    } else {
      comparison.winner = "skip";
      counters.skipped++;
      detailedResults.push(comparison);
    }
  }

  close();

  displayFinalResults({
    model1Name: config.MODEL1_NAME,
    model2Name: isExistingMode ? "Existing AI Tags" : config.MODEL2_NAME!,
    model1Votes: counters.model1Votes,
    model2Votes: counters.model2Votes,
    skipped: counters.skipped,
    errors: counters.errors,
    total: counters.total,
  });
}

main().catch((error) => {
  console.error(chalk.red(`\n✗ Fatal error: ${error}\n`));
  process.exit(1);
});
