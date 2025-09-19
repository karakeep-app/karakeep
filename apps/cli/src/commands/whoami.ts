import { printError, printObject } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";

export const whoamiCmd = new Command()
  .name("whoami")
  .description("returns info about the owner of this API key")
  .action(async () => {
    await getAPIClient()
      .users.whoami.query()
      .then(printObject)
      .catch(
        printError(
          `Unable to fetch information about the owner of this API key`,
        ),
      );
  });
