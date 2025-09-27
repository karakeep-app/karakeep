import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import * as path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { getGlobalOptions } from "@/lib/globals";
import { printErrorMessageWithReason, printStatusMessage } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";

const DEFAULT_MODEL = "mistral";
const DEFAULT_CHUNK_SIZE = 1500;
const GENERATED_SCRIPT_PREFIX = "summarise_tag_";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".karakeep", "synonym-review");
const CACHE_FILENAME = "tag_synonym_cache.json";
const REVIEW_FILENAME = "tag_review_state.json";

function normalizeReviewKey(name: string): string {
  return name.toLowerCase();
}

interface TagSummary {
  id: string;
  name: string;
  numBookmarks: number;
}

interface BookmarkSummary {
  id: string;
  tags: string[];
}

interface PlanAction {
  bookmark_id: string;
  removed_tags: string[];
  target_added: boolean;
}

interface PlanTag {
  id: string;
  name: string;
}

interface SynonymPlan {
  actions: PlanAction[];
  synonym_tags: PlanTag[];
}

interface CacheEntry {
  synonyms: string[];
  notes: string[];
  chunk_size: number;
  plan: SynonymPlan;
  generated_at: string;
}

interface ReviewEntry {
  script: string | null;
  reviewed_at: string;
  targetName?: string;
}

class CacheManager {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Record<string, Record<string, CacheEntry>>> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<
        string,
        Record<string, CacheEntry>
      >;
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      printStatusMessage(
        false,
        `Failed to read cache file at ${this.filePath}. Using empty cache.`,
      );
      return {};
    }
  }

  async save(data: Record<string, Record<string, CacheEntry>>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8",
    );
  }
}

class ReviewStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Record<string, ReviewEntry>> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, ReviewEntry>;
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      const normalized: Record<string, ReviewEntry> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const entry = value as ReviewEntry & Record<string, unknown>;
        if (typeof entry.reviewed_at !== "string") {
          continue;
        }
        const normalizedKey = normalizeReviewKey(key);
        normalized[normalizedKey] = {
          script: typeof entry.script === "string" ? entry.script : null,
          reviewed_at: entry.reviewed_at,
          targetName:
            typeof entry.targetName === "string" && entry.targetName.trim()
              ? entry.targetName
              : key,
        };
      }
      return normalized;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      printStatusMessage(
        false,
        `Failed to read review store at ${this.filePath}. Using empty store.`,
      );
      return {};
    }
  }

  async save(data: Record<string, ReviewEntry>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8",
    );
  }
}

function slugifyTag(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "tag";
}

async function chooseTagToReview(
  tags: TagSummary[],
  preferredName: string | undefined,
  reviewedNames: Set<string>,
): Promise<TagSummary> {
  if (preferredName) {
    const match = tags.find(
      (tag) => tag.name.toLowerCase() === preferredName.toLowerCase(),
    );
    if (!match) {
      throw new Error(`Could not find a tag named '${preferredName}'.`);
    }
    return match;
  }

  const jsonMode = Boolean(getGlobalOptions().json);
  if (jsonMode) {
    throw new Error(
      "When using --json you must provide the TAGNAME argument to avoid interactive prompts.",
    );
  }

  const sortedTags = [...tags].sort((a, b) => b.numBookmarks - a.numBookmarks);
  const unreviewed = sortedTags.filter(
    (tag) => !reviewedNames.has(tag.name.toLowerCase()),
  );

  const topList =
    unreviewed.length > 0 ? unreviewed.slice(0, 10) : sortedTags.slice(0, 10);
  if (unreviewed.length > 0) {
    console.log("Top unreviewed tags by bookmark count:");
  } else {
    console.log("All tags have been reviewed. Showing overall top tags:");
  }
  for (const tag of topList) {
    console.log(`  - ${tag.name} (${tag.numBookmarks} bookmarks)`);
  }

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (
        await rl.question("Enter the tag you want to review: ")
      ).trim();
      if (!answer) {
        console.log("Please enter a non-empty tag name.");
        continue;
      }
      const match = tags.find(
        (tag) => tag.name.toLowerCase() === answer.toLowerCase(),
      );
      if (match) {
        return match;
      }
      const close = tags
        .filter((tag) => tag.name.toLowerCase().includes(answer.toLowerCase()))
        .slice(0, 10)
        .map((tag) => tag.name);
      if (close.length > 0) {
        console.log(`Did you mean one of: ${close.join(", ")}`);
      } else {
        console.log("No tag matched that input. Please try again.");
      }
    }
  } finally {
    rl.close();
  }
}

async function runOllama(
  model: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  const process = spawn("ollama", ["run", model], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  process.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  process.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  process.stdin?.write(prompt);
  process.stdin?.end();

  const exitCode: number = await new Promise((resolve, reject) => {
    process.on("error", (error) => reject(error));
    process.on("close", (code) => resolve(code ?? 0));
  });

  if (exitCode !== 0) {
    const stderr = Buffer.concat(stderrChunks).toString("utf-8");
    throw new Error(`ollama exited with code ${exitCode}: ${stderr}`);
  }

  const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
  const matches = stdout.match(/\{[\s\S]*\}/g);
  if (!matches || matches.length === 0) {
    throw new Error(`Could not find JSON in Ollama response:\n${stdout}`);
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(matches[index]);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore and continue trying previous matches.
    }
  }

  throw new Error(`Failed to parse Ollama response as JSON:\n${stdout}`);
}

async function collectSynonyms(
  target: TagSummary,
  otherTags: TagSummary[],
  model: string,
  chunkSize: number,
): Promise<{ synonyms: string[]; notes: string[] }> {
  if (chunkSize < 1) {
    throw new Error("--chunk-size must be at least 1");
  }

  const candidates = otherTags
    .filter((tag) => tag.name.toLowerCase() !== target.name.toLowerCase())
    .map((tag) => tag.name);

  if (candidates.length === 0) {
    return { synonyms: [], notes: [] };
  }

  const synonymSet = new Set<string>();
  const notes: string[] = [];

  for (let index = 0; index < candidates.length; index += chunkSize) {
    const slice = candidates.slice(index, index + chunkSize);
    const prompt = buildOllamaPrompt(target, slice);
    const response = await runOllama(model, prompt);
    const rawSynonyms = response.synonyms;
    if (Array.isArray(rawSynonyms)) {
      for (const entry of rawSynonyms) {
        if (typeof entry !== "string") {
          continue;
        }
        const normalized = entry.trim();
        if (
          normalized &&
          normalized.toLowerCase() !== target.name.toLowerCase()
        ) {
          synonymSet.add(normalized);
        }
      }
    }
    const note = response.notes;
    if (typeof note === "string" && note.trim().length > 0) {
      notes.push(note.trim());
    }
  }

  return {
    synonyms: Array.from(synonymSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    notes,
  };
}

function buildOllamaPrompt(target: TagSummary, candidates: string[]): string {
  const candidateText = candidates.map((name) => `- ${name}`).join("\n");
  return [
    "You are helping to deduplicate bookmark tags.",
    `The tag to be reviewed is: '${target.name}'.`,
    "A list of other tags is provided below.",
    "Return a JSON object with two keys: 'synonyms' (an array of tag names that are synonyms of the reviewed tag and should be merged into it) and 'notes' (a short explanation).",
    "Only include tags that clearly mean the same thing as the reviewed tag.",
    "If there are no synonyms, return an empty array.",
    "Do not invent new tags.",
    "",
    "Other tags:",
    candidateText,
    "",
    "JSON response:",
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchTags(): Promise<TagSummary[]> {
  const api = getAPIClient();
  const response = await api.tags.list.query();
  return response.tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    numBookmarks: tag.numBookmarks,
  }));
}

async function fetchAllBookmarks(): Promise<BookmarkSummary[]> {
  const api = getAPIClient();
  const limit = MAX_NUM_BOOKMARKS_PER_PAGE;
  const bookmarks: BookmarkSummary[] = [];

  let cursor: unknown | null = null;
  while (true) {
    const request: Record<string, unknown> = {
      limit,
      useCursorV2: true,
      includeContent: false,
    };
    if (cursor) {
      request.cursor = cursor;
    }

    const response = await api.bookmarks.getBookmarks.query(request);
    for (const bookmark of response.bookmarks as ZBookmark[]) {
      bookmarks.push({
        id: bookmark.id,
        tags: bookmark.tags.map((tag) => tag.name),
      });
    }

    if (!response.nextCursor) {
      break;
    }
    cursor = response.nextCursor;
  }

  return bookmarks;
}

function buildMergePlan(
  target: TagSummary,
  synonyms: string[],
  allTags: TagSummary[],
  bookmarks: BookmarkSummary[],
): SynonymPlan {
  const synonymLookup = new Map<string, string>();
  for (const name of synonyms) {
    synonymLookup.set(name.toLowerCase(), name);
  }

  const affectedTags = allTags.filter((tag) =>
    synonymLookup.has(tag.name.toLowerCase()),
  );
  const actions: PlanAction[] = [];

  for (const bookmark of bookmarks) {
    const lowerTags = new Map<string, string>();
    for (const tag of bookmark.tags) {
      lowerTags.set(tag.toLowerCase(), tag);
    }
    const matchedKeys = Array.from(lowerTags.keys()).filter((name) =>
      synonymLookup.has(name),
    );
    if (matchedKeys.length === 0) {
      continue;
    }

    const targetPresent = lowerTags.has(target.name.toLowerCase());
    const removedTags = matchedKeys
      .map((name) => lowerTags.get(name)!)
      .filter(Boolean);

    actions.push({
      bookmark_id: bookmark.id,
      removed_tags: removedTags,
      target_added: !targetPresent,
    });
  }

  return {
    actions,
    synonym_tags: affectedTags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

function escapePayloadJson(json: string): string {
  return json.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function generateScript(
  target: TagSummary,
  synonyms: string[],
  notes: string[],
  plan: SynonymPlan,
  outputPath: string,
): Promise<void> {
  const payload = {
    generated_at: new Date().toISOString(),
    target: { id: target.id, name: target.name },
    synonyms,
    notes,
    actions: plan.actions,
    deleted_tags: plan.synonym_tags,
  };

  const payloadJson = escapePayloadJson(JSON.stringify(payload, null, 2));
  const generatedOn = new Date().toISOString();

  const scriptBody = String.raw`#!/usr/bin/env python3
"""Apply or undo the tag merge for '${target.name}'.

This file was generated by the karakeep CLI on ${generatedOn}.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from typing import Sequence

PAYLOAD = json.loads("""${payloadJson}""")


class CommandError(RuntimeError):
    pass


def ensure_env_vars() -> None:
    missing = [name for name in ("KARAKEEP_API_KEY", "KARAKEEP_SERVER_ADDR") if not os.getenv(name)]
    if missing:
        raise SystemExit("Missing required environment variable(s): {}".format(", ".join(missing)))


def run_subprocess(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    try:
        process = subprocess.run(
            cmd,
            check=False,
            text=True,
            capture_output=True,
            env=os.environ,
        )
    except FileNotFoundError as exc:
        raise CommandError(f"Command not found: {cmd[0]}") from exc
    if process.returncode != 0:
        raise CommandError(
            "Command failed: {}\nSTDOUT:{}\nSTDERR:{}".format(
                " ".join(shlex.quote(part) for part in cmd),
                process.stdout or " <empty>",
                process.stderr or " <empty>",
            )
        )
    return process


def run_cli_command(args: Sequence[str]) -> subprocess.CompletedProcess[str]:
    base_cmd = [
        "pnpm",
        "--filter",
        "@karakeep/cli",
        "--reporter",
        "silent",
        "run",
        "run",
        "--",
    ]
    return run_subprocess(base_cmd + list(args))


def update_bookmark(bookmark_id: str, to_add: Sequence[str], to_remove: Sequence[str], *, dry_run: bool) -> None:
    if not to_add and not to_remove:
        return
    args = ["bookmarks", "update-tags", bookmark_id]
    for tag in to_add:
        args.extend(["--add-tag", tag])
    for tag in to_remove:
        args.extend(["--remove-tag", tag])
    if dry_run:
        print(f"[dry-run] Would update bookmark {bookmark_id}: +{list(to_add)} -{list(to_remove)}")
        return
    run_cli_command(args)


def delete_tag(tag_id: str, tag_name: str, *, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] Would delete tag '{tag_name}' ({tag_id})")
        return
    run_cli_command(["tags", "delete", tag_id])


def apply_changes(*, dry_run: bool) -> None:
    target_name = PAYLOAD["target"]["name"]
    for action in PAYLOAD["actions"]:
        to_add = [target_name] if action.get("target_added") else []
        to_remove = action.get("removed_tags", [])
        update_bookmark(action["bookmark_id"], to_add, to_remove, dry_run=dry_run)
    for tag in PAYLOAD["deleted_tags"]:
        delete_tag(tag["id"], tag["name"], dry_run=dry_run)


def undo_changes(*, dry_run: bool) -> None:
    target_name = PAYLOAD["target"]["name"]
    for action in PAYLOAD["actions"]:
        to_add = action.get("removed_tags", [])
        to_remove = [target_name] if action.get("target_added") else []
        update_bookmark(action["bookmark_id"], to_add, to_remove, dry_run=dry_run)
    for tag in PAYLOAD["deleted_tags"]:
        if dry_run:
            print(f"[dry-run] Would recreate tag '{tag['name']}' ({tag['id']})")
            continue
        print(
            "To recreate tag {name} ({id}) you must add it manually via the CLI.".format(
                name=tag["name"],
                id=tag["id"],
            )
        )


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Only print actions without executing them")
    parser.add_argument("--undo", action="store_true", help="Undo the merge by re-attaching removed tags")
    args = parser.parse_args(argv)

    ensure_env_vars()

    try:
        if args.undo:
            undo_changes(dry_run=args.dry_run)
        else:
            apply_changes(dry_run=args.dry_run)
    except CommandError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, scriptBody, "utf-8");
  await fs.chmod(outputPath, 0o755);
}

function ensureConfirmation(
  message: string,
  autoConfirm: boolean,
): Promise<boolean> {
  if (autoConfirm) {
    return Promise.resolve(true);
  }
  const rl = readline.createInterface({ input, output });
  return rl
    .question(`${message} [y/N]: `)
    .then((answer) => {
      const normalized = answer.trim().toLowerCase();
      return normalized === "y" || normalized === "yes";
    })
    .finally(() => rl.close());
}

export function registerSynonymSuggestCommand(parent: Command): void {
  parent
    .command("synonym-suggest")
    .description(
      "Review tags for synonyms, cache analyses, and emit reversible merge scripts.",
    )
    .argument("[tagName]", "Tag to review")
    .option("--model <model>", "Ollama model to use", DEFAULT_MODEL)
    .option(
      "--chunk-size <size>",
      "Number of tag names to send to Ollama at once",
      (value: string) => parseInt(value, 10),
      DEFAULT_CHUNK_SIZE,
    )
    .option("--dry-run", "Show a summary of actions when generating the script")
    .option("--auto-confirm", "Skip the confirmation prompt")
    .option(
      "--refresh-cache",
      "Ignore cached analyses and recompute suggestions",
    )
    .option(
      "--data-dir <path>",
      "Directory to store cache and review files",
      DEFAULT_DATA_DIR,
    )
    .option(
      "--output-dir <path>",
      "Directory where per-tag scripts will be written",
      process.cwd(),
    )
    .action(async (tagName, options) => {
      const opts = {
        model: options.model as string,
        chunkSize: Number(options.chunkSize ?? DEFAULT_CHUNK_SIZE),
        dryRun: Boolean(options.dryRun),
        autoConfirm: Boolean(options.autoConfirm),
        refreshCache: Boolean(options.refreshCache),
        dataDir: path.resolve(options.dataDir as string),
        outputDir: path.resolve(options.outputDir as string),
      };

      try {
        await fs.mkdir(opts.dataDir, { recursive: true });
      } catch (error) {
        printErrorMessageWithReason(
          "Failed to prepare data directory",
          error as object,
        );
        return;
      }

      if (!Number.isFinite(opts.chunkSize) || opts.chunkSize < 1) {
        printStatusMessage(false, "--chunk-size must be a positive integer.");
        return;
      }

      const cacheManager = new CacheManager(
        path.join(opts.dataDir, CACHE_FILENAME),
      );
      const reviewStore = new ReviewStore(
        path.join(opts.dataDir, REVIEW_FILENAME),
      );

      printStatusMessage(true, "Fetching tags...");
      let tags: TagSummary[];
      try {
        tags = await fetchTags();
      } catch (error) {
        printErrorMessageWithReason("Failed to fetch tags", error as object);
        return;
      }

      if (tags.length === 0) {
        printStatusMessage(false, "No tags were returned by the API.");
        return;
      }

      const reviewData = await reviewStore.load();
      const reviewedNames = new Set(Object.keys(reviewData));

      let target: TagSummary;
      try {
        target = await chooseTagToReview(tags, tagName, reviewedNames);
      } catch (error) {
        printErrorMessageWithReason(
          "Failed to determine tag to review",
          error as object,
        );
        return;
      }

      const cacheData = await cacheManager.load();
      const cacheKey = target.name.toLowerCase();
      const cachedByModel = cacheData[cacheKey] ?? {};
      let cacheEntry: CacheEntry | undefined;
      if (!opts.refreshCache) {
        cacheEntry = cachedByModel[opts.model];
      }

      let synonyms: string[] = [];
      let notes: string[] = [];
      if (cacheEntry) {
        synonyms = Array.isArray(cacheEntry.synonyms)
          ? [...cacheEntry.synonyms]
          : [];
        notes = Array.isArray(cacheEntry.notes) ? [...cacheEntry.notes] : [];
        console.log(
          `Using cached analysis generated at ${cacheEntry.generated_at ?? "an unknown time"}.`,
        );
      } else {
        printStatusMessage(true, "Collecting synonyms via Ollama...");
        try {
          const result = await collectSynonyms(
            target,
            tags,
            opts.model,
            opts.chunkSize,
          );
          synonyms = result.synonyms;
          notes = result.notes;
        } catch (error) {
          printErrorMessageWithReason(
            "Failed to collect synonyms",
            error as object,
          );
          return;
        }
      }

      if (notes.length > 0) {
        console.log("Model notes:");
        for (const note of notes) {
          console.log(`  - ${note}`);
        }
      }

      if (synonyms.length === 0) {
        console.log(
          "The model did not find any synonyms for this tag. Marking as reviewed.",
        );
        const reviewKey = normalizeReviewKey(target.name);
        reviewData[reviewKey] = {
          script: null,
          reviewed_at: new Date().toISOString(),
          targetName: target.name,
        };
        await reviewStore.save(reviewData);
        return;
      }

      console.log("Suggested synonyms to merge:");
      for (const name of synonyms) {
        console.log(`  - ${name}`);
      }

      const confirmed = await ensureConfirmation(
        "Generate the merge script for these tags?",
        opts.autoConfirm,
      );
      if (!confirmed) {
        console.log("Aborted by user.");
        return;
      }

      let plan: SynonymPlan | undefined = cacheEntry?.plan;
      if (
        plan &&
        (!Array.isArray(plan.actions) || !Array.isArray(plan.synonym_tags))
      ) {
        plan = undefined;
      }
      if (!plan || opts.refreshCache) {
        if (!plan || opts.refreshCache) {
          printStatusMessage(true, "Fetching bookmarks to build merge plan...");
        }
        let bookmarks: BookmarkSummary[] = [];
        try {
          bookmarks = await fetchAllBookmarks();
        } catch (error) {
          printErrorMessageWithReason(
            "Failed to fetch bookmarks",
            error as object,
          );
          return;
        }
        plan = buildMergePlan(target, synonyms, tags, bookmarks);
      }

      if (opts.dryRun) {
        const actions = Array.isArray(plan.actions) ? plan.actions : [];
        console.log(
          `[dry-run] ${actions.length} bookmark(s) would be updated.`,
        );
        for (const action of actions.slice(0, 5)) {
          console.log(
            `    Bookmark ${action.bookmark_id}: add=${action.target_added ? "yes" : "no"} remove=${action.removed_tags.join(", ")}`,
          );
        }
      }

      const slug = slugifyTag(target.name);
      const scriptPath = path.join(
        opts.outputDir,
        `${GENERATED_SCRIPT_PREFIX}${slug}.py`,
      );
      try {
        await fs.access(scriptPath);
        const overwrite = await ensureConfirmation(
          `Script ${path.basename(scriptPath)} already exists. Overwrite?`,
          opts.autoConfirm,
        );
        if (!overwrite) {
          console.log("Aborted to avoid overwriting existing script.");
          return;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          printErrorMessageWithReason(
            "Failed to check existing script",
            error as object,
          );
          return;
        }
      }

      await generateScript(target, synonyms, notes, plan, scriptPath);
      console.log(`Created ${scriptPath} with apply/undo instructions.`);

      const updatedCacheEntry: CacheEntry = {
        synonyms,
        notes,
        chunk_size: opts.chunkSize,
        plan,
        generated_at: new Date().toISOString(),
      };

      const existingEntries = cacheData[cacheKey] ?? {};
      cacheData[cacheKey] = {
        ...existingEntries,
        [opts.model]: updatedCacheEntry,
      };
      await cacheManager.save(cacheData);

      const reviewKey = normalizeReviewKey(target.name);
      reviewData[reviewKey] = {
        script: scriptPath,
        reviewed_at: new Date().toISOString(),
        targetName: target.name,
      };
      await reviewStore.save(reviewData);
    });
}
