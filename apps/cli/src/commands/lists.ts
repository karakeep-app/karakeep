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

import {
  listNameFromPath,
  listsToTree,
} from "@karakeep/shared/utils/listUtils";

export const listsCmd = new Command()
  .name("lists")
  .description("manipulating lists");

listsCmd
  .command("list")
  .description("lists all lists")
  .action(async () => {
    const api = getAPIClient();

    try {
      const [resp, statsResp] = await Promise.all([
        api.lists.list.query(),
        api.lists.stats.query(),
      ]);

      if (getGlobalOptions().json) {
        printObject(resp);
      } else {
        const { allPaths } = listsToTree(resp.lists);
        const data: string[][] = [["Id", "Name", "Description", "Bookmarks"]];

        allPaths.forEach((path) => {
          const name = listNameFromPath(path);
          const leaf = path[path.length - 1];
          const count = statsResp.stats.get(leaf.id) ?? 0;
          data.push([leaf.id, name, leaf.description ?? "", count.toString()]);
        });
        console.log(
          table(data, {
            border: getBorderCharacters("ramac"),
            singleLine: true,
          }),
        );
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to list all lists", error as object);
    }
  });

listsCmd
  .command("create")
  .description("creates a new list")
  .requiredOption("--name <name>", "the name of the list")
  .requiredOption("--icon <icon>", "the icon of the list (one emoji)")
  .option("--type <type>", "the type of the list (manual or smart)", "manual")
  .option("--description <description>", "the description of the list")
  .option(
    "--query <query>",
    "the search query for smart lists (required for smart lists)",
  )
  .option("--parent-id <id>", "the id of the parent list")
  .action(async (opts) => {
    const api = getAPIClient();

    await api.lists.create
      .mutate({
        name: opts.name,
        icon: opts.icon,
        type: opts.type as "manual" | "smart",
        description: opts.description,
        query: opts.query,
        parentId: opts.parentId,
      })
      .then(printObject)
      .catch(printError("Failed to create list"));
  });

listsCmd
  .command("delete")
  .description("deletes a list")
  .argument("<id>", "the id of the list")
  .action(async (id) => {
    const api = getAPIClient();

    await api.lists.delete
      .mutate({
        listId: id,
      })
      .then(printSuccess(`Successfully deleted list with id "${id}"`))
      .catch(printError(`Failed to delete list with id "${id}"`));
  });

export async function addToList(listId: string, bookmarkId: string) {
  const api = getAPIClient();

  await api.lists.addToList
    .mutate({
      listId,
      bookmarkId,
    })
    .then(
      printSuccess(
        `Successfully added bookmark "${bookmarkId}" to list with id "${listId}"`,
      ),
    )
    .catch(
      printError(
        `Failed to add bookmark "${bookmarkId}" to list with id "${listId}"`,
      ),
    );
}

listsCmd
  .command("get")
  .description("get a list by id")
  .argument("<id>", "the id of the list")
  .action(async (id) => {
    const api = getAPIClient();
    try {
      const list = await api.lists.get.query({ listId: id });
      if (getGlobalOptions().json) {
        printObject(list);
      } else {
        console.log(chalk.bold(`${list.icon} ${list.name}`));
        console.log(chalk.dim(`  Id:   ${list.id}`));
        console.log(chalk.dim(`  Type: ${list.type}`));
        if (list.description) console.log(`  Description: ${list.description}`);
        if (list.query) console.log(`  Query: ${list.query}`);
        if (list.parentId) console.log(`  Parent: ${list.parentId}`);
        console.log(`  Public: ${list.public ? "yes" : "no"}`);
        console.log(`  Role: ${list.userRole}`);
        if (list.hasCollaborators) console.log(`  Collaborators: yes`);
        console.log();
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to get the list", error as object);
    }
  });

listsCmd
  .command("add-bookmark")
  .description("add a bookmark to list")
  .requiredOption("--list <id>", "the id of the list")
  .requiredOption("--bookmark <bookmark>", "the id of the bookmark")
  .action(async (opts) => {
    await addToList(opts.list, opts.bookmark);
  });

listsCmd
  .command("remove-bookmark")
  .description("remove a bookmark from list")
  .requiredOption("--list <id>", "the id of the list")
  .requiredOption("--bookmark <bookmark>", "the id of the bookmark")
  .action(async (opts) => {
    const api = getAPIClient();

    await api.lists.removeFromList
      .mutate({
        listId: opts.list,
        bookmarkId: opts.bookmark,
      })
      .then(
        printSuccess(
          `Successfully removed bookmark "${opts.bookmark}" from list with id "${opts.list}"`,
        ),
      )
      .catch(
        printError(
          `Failed to remove bookmark "${opts.bookmark}" from list with id "${opts.list}"`,
        ),
      );
  });
