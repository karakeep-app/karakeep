import { Command } from "@commander-js/extra-typings";
import { readFileSync } from "node:fs";

declare const __KARAKEEP_SKILL_CONTENT__: string;

const skillContent =
  typeof __KARAKEEP_SKILL_CONTENT__ === "string"
    ? __KARAKEEP_SKILL_CONTENT__
    : readFileSync(
        new URL("../../../../skills/SKILL.md", import.meta.url),
        "utf8",
      );

export const skillCmd = new Command()
  .name("skill")
  .description("prints the official Karakeep agent skill")
  .action(() => {
    process.stdout.write(skillContent);
  });
