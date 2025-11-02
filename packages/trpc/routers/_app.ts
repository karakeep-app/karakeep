import { router } from "../index";
import { adminAppRouter } from "./admin";
import { apiKeysAppRouter } from "./apiKeys";
import { assetsAppRouter } from "./assets";
import { bookmarksAppRouter } from "./bookmarks";
import { feedsAppRouter } from "./feeds";
import { highlightsAppRouter } from "./highlights";
import { importSessionsRouter } from "./importSessions";
import { invitesAppRouter } from "./invites";
import { listsAppRouter } from "./lists";
import { promptsAppRouter } from "./prompts";
import { publicBookmarks } from "./publicBookmarks";
import { rulesAppRouter } from "./rules";
import { subscriptionsRouter } from "./subscriptions";
import { tagsAppRouter } from "./tags";
import { usersAppRouter } from "./users";
import { webhooksAppRouter } from "./webhooks";

export const appRouter = router({
  bookmarks: bookmarksAppRouter,
  apiKeys: apiKeysAppRouter,
  users: usersAppRouter,
  lists: listsAppRouter,
  tags: tagsAppRouter,
  prompts: promptsAppRouter,
  admin: adminAppRouter,
  feeds: feedsAppRouter,
  highlights: highlightsAppRouter,
  importSessions: importSessionsRouter,
  webhooks: webhooksAppRouter,
  assets: assetsAppRouter,
  rules: rulesAppRouter,
  invites: invitesAppRouter,
  publicBookmarks: publicBookmarks,
  subscriptions: subscriptionsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
