import { getGlobalOptions } from "@/lib/globals";
import {
  printError,
  printErrorMessageWithReason,
  printObject,
  printSuccess,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { getBorderCharacters, table } from "table";

export const tagsCmd = new Command()
  .name("tags")
  .description("manipulating tags");

tagsCmd
  .command("list")
  .description("lists all tags")
  .action(async () => {
    const api = getAPIClient();

    try {
      const tags = (await api.tags.list.query({})).tags;
      tags.sort((a, b) => b.numBookmarks - a.numBookmarks);
      if (getGlobalOptions().json) {
        printObject(tags);
      } else {
        const data: string[][] = [["Id", "Name", "Num bookmarks"]];

        tags.forEach((tag) => {
          data.push([tag.id, tag.name, tag.numBookmarks.toString()]);
        });
        console.log(
          table(data, {
            border: getBorderCharacters("ramac"),
            singleLine: true,
          }),
        );
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to list all tags", error as object);
    }
  });

tagsCmd
  .command("get")
  .description("get a tag by id or name")
  .argument("[id]", "the id of the tag")
  .option("--name <name>", "the name of the tag")
  .action(async (id, opts) => {
    if (!id && !opts.name) {
      console.error("Error: either <id> or --name must be provided");
      process.exit(1);
    }

    const api = getAPIClient();

    try {
      let tagId = id;
      if (!tagId) {
        const tags = (await api.tags.list.query({ nameContains: opts.name }))
          .tags;
        const exactMatch = tags.find((t) => t.name === opts.name);
        if (!exactMatch) {
          console.error(`No tag found with the name "${opts.name}"`);
          process.exit(1);
        }
        tagId = exactMatch.id;
      }

      const tag = await api.tags.get.query({ tagId });
      if (getGlobalOptions().json) {
        printObject(tag);
      } else {
        console.log(chalk.bold(tag.name));
        console.log(chalk.dim(`  Id:        ${tag.id}`));
        console.log(`  Bookmarks: ${tag.numBookmarks}`);
        const byType = tag.numBookmarksByAttachedType;
        if (byType.ai || byType.human) {
          const parts = [];
          if (byType.human) parts.push(`${byType.human} by human`);
          if (byType.ai) parts.push(`${byType.ai} by AI`);
          console.log(`  Breakdown: ${parts.join(", ")}`);
        }
        console.log();
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to get the tag", error as object);
    }
  });

tagsCmd
  .command("merge")
  .description("merge tags into a target tag")
  .requiredOption("--into <id>", "the id of the tag to merge into")
  .requiredOption(
    "--from <ids...>",
    "the ids of the tags to merge from (space separated)",
  )
  .action(async (opts) => {
    const api = getAPIClient();

    await api.tags.merge
      .mutate({
        intoTagId: opts.into,
        fromTagIds: opts.from,
      })
      .then(printObject)
      .catch(printError("Failed to merge tags"));
  });

tagsCmd
  .command("delete")
  .description("delete a tag")
  .argument("<id>", "the id of the tag")
  .action(async (id) => {
    const api = getAPIClient();

    await api.tags.delete
      .mutate({
        tagId: id,
      })
      .then(printSuccess(`Successfully deleted the tag with the id "${id}"`))
      .catch(printError(`Failed to delete the tag with the id "${id}"`));
  });
