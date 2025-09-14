import { bookmarkCmd } from "@/commands/bookmarks";
import { dumpCmd } from "@/commands/dump";
import { listsCmd } from "@/commands/lists";
import { migrateCmd } from "@/commands/migrate";
import { tagsCmd } from "@/commands/tags";
import { whoamiCmd } from "@/commands/whoami";
import { wipeCmd } from "@/commands/wipe";
import { setGlobalOptions } from "@/lib/globals";
import { Command, Option } from "@commander-js/extra-typings";

const program = new Command()
  .name("karakeep")
  .description("A CLI interface to interact with the karakeep api")
  .addOption(
    new Option("--api-key <key>", "the API key to interact with the API")
      .makeOptionMandatory(true)
      .env("KARAKEEP_API_KEY"),
  )
  .addOption(
    new Option(
      "--server-addr <addr>",
      "the address of the server to connect to",
    )
      .makeOptionMandatory(true)
      .env("KARAKEEP_SERVER_ADDR"),
  )
  .addOption(new Option("--json", "to output the result as JSON"))
  .version(
    import.meta.env && "CLI_VERSION" in import.meta.env
      ? import.meta.env.CLI_VERSION
      : "0.0.0",
  );

program.addCommand(bookmarkCmd);
program.addCommand(listsCmd);
program.addCommand(tagsCmd);
program.addCommand(whoamiCmd);
program.addCommand(migrateCmd);
program.addCommand(wipeCmd);
program.addCommand(dumpCmd);

setGlobalOptions(program.opts());

program.parse();
