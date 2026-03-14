import { getGlobalOptions } from "@/lib/globals";
import {
  printErrorMessageWithReason,
  printObject,
  printStatusMessage,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import { getBorderCharacters, table } from "table";

export const adminCmd = new Command()
  .name("admin")
  .description("admin commands");

function toHumanReadableSize(size: number): string {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (size === 0) return "0 Bytes";
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

// --- Users subcommand ---

const usersCmd = new Command()
  .name("users")
  .description("user management commands");

usersCmd
  .command("list")
  .description("list all users")
  .action(async () => {
    const api = getAPIClient();

    try {
      const [usersResp, userStats] = await Promise.all([
        api.users.list.query(),
        api.admin.userStats.query(),
      ]);

      if (getGlobalOptions().json) {
        printObject({
          users: usersResp.users.map((u) => ({
            ...u,
            numBookmarks: userStats[u.id]?.numBookmarks ?? 0,
            assetSizes: userStats[u.id]?.assetSizes ?? 0,
          })),
        });
      } else {
        const data: string[][] = [
          [
            "Name",
            "Email",
            "Num Bookmarks",
            "Asset Sizes",
            "Role",
            "Local User",
          ],
        ];

        usersResp.users.forEach((user) => {
          const stats = userStats[user.id] ?? {
            numBookmarks: 0,
            assetSizes: 0,
          };

          const numBookmarksDisplay = `${stats.numBookmarks} / ${user.bookmarkQuota?.toString() ?? "Unlimited"}`;
          const assetSizesDisplay = `${toHumanReadableSize(stats.assetSizes)} / ${user.storageQuota ? toHumanReadableSize(user.storageQuota) : "Unlimited"}`;

          data.push([
            user.name,
            user.email,
            numBookmarksDisplay,
            assetSizesDisplay,
            user.role ?? "",
            user.localUser ? "✓" : "✗",
          ]);
        });

        console.log(
          table(data, {
            border: getBorderCharacters("ramac"),
            drawHorizontalLine: (lineIndex, rowCount) => {
              return (
                lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount
              );
            },
          }),
        );
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to list all users", error as object);
    }
  });

adminCmd.addCommand(usersCmd);

// --- Bookmarks subcommand ---

const bookmarksCmd = new Command()
  .name("bookmarks")
  .description("admin bookmark management commands");

bookmarksCmd
  .command("debug")
  .description("get debug info for a bookmark")
  .argument("<bookmarkId>", "the id of the bookmark to debug")
  .action(async (bookmarkId) => {
    const api = getAPIClient();

    try {
      const debugInfo = await api.admin.getBookmarkDebugInfo.query({
        bookmarkId,
      });

      if (getGlobalOptions().json) {
        printObject(debugInfo);
      } else {
        const basicData: string[][] = [["Field", "Value"]];
        basicData.push(["ID", debugInfo.id]);
        basicData.push(["Type", debugInfo.type]);
        basicData.push(["Source", debugInfo.source ?? "N/A"]);
        basicData.push(["Owner User ID", debugInfo.userId]);
        basicData.push([
          "Created At",
          new Date(debugInfo.createdAt).toISOString(),
        ]);
        basicData.push([
          "Modified At",
          debugInfo.modifiedAt
            ? new Date(debugInfo.modifiedAt).toISOString()
            : "N/A",
        ]);
        basicData.push(["Title", debugInfo.title ?? "N/A"]);
        basicData.push(["Summary", debugInfo.summary ?? "N/A"]);
        basicData.push(["Tagging Status", debugInfo.taggingStatus ?? "N/A"]);
        basicData.push([
          "Summarization Status",
          debugInfo.summarizationStatus ?? "N/A",
        ]);

        if (debugInfo.linkInfo) {
          basicData.push(["URL", debugInfo.linkInfo.url]);
          basicData.push(["Crawl Status", debugInfo.linkInfo.crawlStatus]);
          basicData.push([
            "Crawl Status Code",
            debugInfo.linkInfo.crawlStatusCode?.toString() ?? "N/A",
          ]);
          basicData.push([
            "Crawled At",
            debugInfo.linkInfo.crawledAt
              ? new Date(debugInfo.linkInfo.crawledAt).toISOString()
              : "N/A",
          ]);
          basicData.push([
            "Has HTML Content",
            debugInfo.linkInfo.hasHtmlContent ? "Yes" : "No",
          ]);
          basicData.push([
            "Has Content Asset",
            debugInfo.linkInfo.hasContentAsset ? "Yes" : "No",
          ]);
        }

        if (debugInfo.textInfo) {
          basicData.push([
            "Has Text",
            debugInfo.textInfo.hasText ? "Yes" : "No",
          ]);
          basicData.push(["Source URL", debugInfo.textInfo.sourceUrl ?? "N/A"]);
        }

        if (debugInfo.assetInfo) {
          basicData.push(["Asset Type", debugInfo.assetInfo.assetType]);
          basicData.push([
            "Has Content",
            debugInfo.assetInfo.hasContent ? "Yes" : "No",
          ]);
          basicData.push(["File Name", debugInfo.assetInfo.fileName ?? "N/A"]);
        }

        console.log(
          table(basicData, {
            border: getBorderCharacters("ramac"),
            drawHorizontalLine: (lineIndex, rowCount) =>
              lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
          }),
        );

        if (debugInfo.tags.length > 0) {
          console.log("Tags:");
          const tagsData: string[][] = [["Name", "Attached By"]];
          debugInfo.tags.forEach((tag) => {
            tagsData.push([tag.name, tag.attachedBy]);
          });
          console.log(
            table(tagsData, {
              border: getBorderCharacters("ramac"),
              drawHorizontalLine: (lineIndex, rowCount) =>
                lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
            }),
          );
        }

        if (debugInfo.assets.length > 0) {
          console.log("Assets:");
          const assetsData: string[][] = [["Type", "Size", "URL"]];
          debugInfo.assets.forEach((asset) => {
            assetsData.push([
              asset.assetType,
              toHumanReadableSize(asset.size),
              asset.url ?? "N/A",
            ]);
          });
          console.log(
            table(assetsData, {
              border: getBorderCharacters("ramac"),
              drawHorizontalLine: (lineIndex, rowCount) =>
                lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
            }),
          );
        }
      }
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to get bookmark debug info",
        error as object,
      );
    }
  });

bookmarksCmd
  .command("recrawl")
  .description("trigger a recrawl for a link bookmark")
  .argument("<bookmarkId>", "the id of the bookmark to recrawl")
  .action(async (bookmarkId) => {
    const api = getAPIClient();
    try {
      await api.admin.adminRecrawlBookmark.mutate({ bookmarkId });
      printStatusMessage(true, "Recrawl queued successfully");
    } catch (error) {
      printErrorMessageWithReason("Failed to queue recrawl", error as object);
    }
  });

bookmarksCmd
  .command("reindex")
  .description("trigger a search reindex for a bookmark")
  .argument("<bookmarkId>", "the id of the bookmark to reindex")
  .action(async (bookmarkId) => {
    const api = getAPIClient();
    try {
      await api.admin.adminReindexBookmark.mutate({ bookmarkId });
      printStatusMessage(true, "Reindex queued successfully");
    } catch (error) {
      printErrorMessageWithReason("Failed to queue reindex", error as object);
    }
  });

bookmarksCmd
  .command("retag")
  .description("trigger AI retagging for a bookmark")
  .argument("<bookmarkId>", "the id of the bookmark to retag")
  .action(async (bookmarkId) => {
    const api = getAPIClient();
    try {
      await api.admin.adminRetagBookmark.mutate({ bookmarkId });
      printStatusMessage(true, "Retag queued successfully");
    } catch (error) {
      printErrorMessageWithReason("Failed to queue retag", error as object);
    }
  });

bookmarksCmd
  .command("resummarize")
  .description("trigger AI resummarization for a link bookmark")
  .argument("<bookmarkId>", "the id of the bookmark to resummarize")
  .action(async (bookmarkId) => {
    const api = getAPIClient();
    try {
      await api.admin.adminResummarizeBookmark.mutate({ bookmarkId });
      printStatusMessage(true, "Resummarize queued successfully");
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue resummarize",
        error as object,
      );
    }
  });

adminCmd.addCommand(bookmarksCmd);

// --- Jobs subcommand ---

const jobsCmd = new Command()
  .name("jobs")
  .description("background job management commands");

jobsCmd
  .command("stats")
  .description("show background job queue statistics")
  .action(async () => {
    const api = getAPIClient();

    try {
      const stats = await api.admin.backgroundJobsStats.query();

      if (getGlobalOptions().json) {
        printObject(stats);
      } else {
        const data: string[][] = [["Queue", "Queued", "Unprocessed", "Failed"]];

        data.push([
          "Crawling",
          stats.crawlStats.queued.toString(),
          stats.crawlStats.pending.toString(),
          stats.crawlStats.failed.toString(),
        ]);
        data.push([
          "Inference (Tag/Summarize)",
          stats.inferenceStats.queued.toString(),
          stats.inferenceStats.pending.toString(),
          stats.inferenceStats.failed.toString(),
        ]);
        data.push([
          "Search Indexing",
          stats.indexingStats.queued.toString(),
          "-",
          "-",
        ]);
        data.push([
          "Video Processing",
          stats.videoStats.queued.toString(),
          "-",
          "-",
        ]);
        data.push(["Webhooks", stats.webhookStats.queued.toString(), "-", "-"]);
        data.push([
          "Asset Preprocessing",
          stats.assetPreprocessingStats.queued.toString(),
          "-",
          "-",
        ]);
        data.push(["Feeds", stats.feedStats.queued.toString(), "-", "-"]);
        data.push([
          "Admin Maintenance",
          stats.adminMaintenanceStats.queued.toString(),
          "-",
          "-",
        ]);

        console.log(
          table(data, {
            border: getBorderCharacters("ramac"),
            drawHorizontalLine: (lineIndex, rowCount) =>
              lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
          }),
        );
      }
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to get background job stats",
        error as object,
      );
    }
  });

jobsCmd
  .command("recrawl-links")
  .description("recrawl all link bookmarks matching a crawl status")
  .requiredOption(
    "--status <status>",
    "filter by crawl status (success, failure, pending, all)",
  )
  .option("--run-inference", "also re-run inference after crawling", false)
  .action(async (opts) => {
    const api = getAPIClient();
    const status = opts.status as "success" | "failure" | "pending" | "all";
    try {
      await api.admin.recrawlLinks.mutate({
        crawlStatus: status,
        runInference: opts.runInference,
      });
      printStatusMessage(
        true,
        `Recrawl queued for all links with crawl status: ${status}`,
      );
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue mass recrawl",
        error as object,
      );
    }
  });

jobsCmd
  .command("reindex-all")
  .description("reindex all bookmarks for search")
  .action(async () => {
    const api = getAPIClient();
    try {
      await api.admin.reindexAllBookmarks.mutate();
      printStatusMessage(true, "Reindex queued for all bookmarks");
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue mass reindex",
        error as object,
      );
    }
  });

jobsCmd
  .command("retag-all")
  .description("re-run AI tagging on all bookmarks matching a status")
  .requiredOption(
    "--status <status>",
    "filter by tagging status (success, failure, pending, all)",
  )
  .action(async (opts) => {
    const api = getAPIClient();
    const status = opts.status as "success" | "failure" | "pending" | "all";
    try {
      await api.admin.reRunInferenceOnAllBookmarks.mutate({
        type: "tag",
        status,
      });
      printStatusMessage(
        true,
        `Retag queued for all bookmarks with tagging status: ${status}`,
      );
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue mass retag",
        error as object,
      );
    }
  });

jobsCmd
  .command("resummarize-all")
  .description("re-run AI summarization on all bookmarks matching a status")
  .requiredOption(
    "--status <status>",
    "filter by summarization status (success, failure, pending, all)",
  )
  .action(async (opts) => {
    const api = getAPIClient();
    const status = opts.status as "success" | "failure" | "pending" | "all";
    try {
      await api.admin.reRunInferenceOnAllBookmarks.mutate({
        type: "summarize",
        status,
      });
      printStatusMessage(
        true,
        `Resummarize queued for all bookmarks with summarization status: ${status}`,
      );
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue mass resummarize",
        error as object,
      );
    }
  });

jobsCmd
  .command("reprocess-assets")
  .description("reprocess all asset bookmarks in fix mode")
  .action(async () => {
    const api = getAPIClient();
    try {
      await api.admin.reprocessAssetsFixMode.mutate();
      printStatusMessage(true, "Asset reprocessing queued for all assets");
    } catch (error) {
      printErrorMessageWithReason(
        "Failed to queue asset reprocessing",
        error as object,
      );
    }
  });

adminCmd.addCommand(jobsCmd);
