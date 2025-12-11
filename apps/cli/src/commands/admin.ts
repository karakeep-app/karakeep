import { getGlobalOptions } from "@/lib/globals";
import { printErrorMessageWithReason, printObject } from "@/lib/output";
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
