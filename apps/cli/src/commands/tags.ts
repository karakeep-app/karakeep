import { getGlobalOptions } from "@/lib/globals";
import {
  printError,
  printErrorMessageWithReason,
  printObject,
  printSuccess,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
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
