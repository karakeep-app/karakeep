import { constants, createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { getGlobalOptions } from "@/lib/globals";
import { getResponseError } from "@/lib/http";
import { printObject, printStatusMessage } from "@/lib/output";
import { Command } from "@commander-js/extra-typings";

export const assetsCmd = new Command()
  .name("assets")
  .description("manipulating assets");

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* readResponseBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

assetsCmd
  .command("download")
  .description("download an asset to a file")
  .argument("<id>", "the id of the asset to download")
  .requiredOption("-o, --output <file>", "the destination file path")
  .option("-f, --force", "overwrite the destination file if it already exists")
  .action(async (id, opts) => {
    const globals = getGlobalOptions();
    const outputPath = path.resolve(opts.output);

    try {
      if (!opts.force && (await pathExists(outputPath))) {
        throw new Error(
          `Destination file already exists at ${outputPath}. Re-run with --force to overwrite it.`,
        );
      }

      const response = await fetch(
        `${globals.serverAddr}/api/v1/assets/${encodeURIComponent(id)}`,
        {
          headers: {
            authorization: `Bearer ${globals.apiKey}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }
      if (!response.body) {
        throw new Error("The server returned an empty response body");
      }

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const temporaryPath = path.join(
        path.dirname(outputPath),
        `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
      );

      try {
        await pipeline(
          readResponseBody(response.body),
          createWriteStream(temporaryPath, { flags: "wx" }),
        );
        if (opts.force) {
          await fs.rename(temporaryPath, outputPath);
        } else {
          await fs.copyFile(temporaryPath, outputPath, constants.COPYFILE_EXCL);
          await fs.unlink(temporaryPath);
        }
      } catch (error) {
        await fs.rm(temporaryPath, { force: true });
        throw error;
      }

      const size = (await fs.stat(outputPath)).size;
      const result = {
        assetId: id,
        output: outputPath,
        contentType: response.headers.get("content-type"),
        size,
      };

      if (globals.json) {
        printObject(result);
      } else {
        printStatusMessage(
          true,
          `Downloaded asset "${id}" to ${outputPath} (${size} bytes)`,
        );
      }
    } catch (error) {
      printStatusMessage(
        false,
        `Failed to download asset "${id}". Reason: ${
          error instanceof Error ? error.message : error
        }`,
      );
      process.exitCode = 1;
    }
  });
