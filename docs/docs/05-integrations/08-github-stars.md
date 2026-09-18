# GitHub Stars

Karakeep can import a GitHub user's publicly starred repositories into a manual list, without a GitHub token or a separate service.

1. Create a manual list in Karakeep.
2. Open **Settings → GitHub Stars**.
3. Enter the GitHub username and choose a list you own. This mode only reads publicly visible stars. A private profile may return no results; hidden stars and private repositories are not accessible.
4. Choose **Import once** to process all pages and stop, or **Synchronize automatically** for daily checks.
5. Optionally enable importing repository topics as tags, then save.

The workers begin importing within about a minute. Each job imports up to 100 repositories. Larger collections continue page by page. After a complete import, Karakeep checks again in 24 hours. **Sync now** requests an earlier check, unless GitHub has asked the server to wait.

Existing bookmarks are reused without changing their notes, favourite status or archived state. Topic import only adds tags. Removing a GitHub star, pausing or disconnecting does not remove any bookmarks or tags. Deleting the destination list also removes its synchronization configuration. Settings changes and disconnect are unavailable while a batch is running. Wait for that batch to finish, then retry. Changing settings restarts the scan; existing imported bookmarks remain. If you delete a bookmark or remove it from the destination list while the repository is still starred, the next scan imports it again.

## Limits and status

The settings page shows the last complete synchronization, next check and any error. A failed page is retried without marking the whole import as complete. You can retry ordinary failures immediately with **Sync now**; GitHub rate-limit cooldowns must expire first. An empty successful scan does not distinguish a profile with hidden stars from one with no stars. Public GitHub API limits are shared by all users on the same server IP, so large collections and multiple subscriptions can take longer. Imports are not an atomic snapshot of GitHub: stars changed during pagination may be picked up by the next complete scan.

Private repositories, GitHub Enterprise and live star-count metadata are not included. This feature does not depend on custom bookmark metadata.

Self-hosted installations must run the `githubStars` worker. If using `WORKERS_ENABLED_WORKERS`, add `githubStars` to that list. It can be disabled with `WORKERS_DISABLED_WORKERS=githubStars`.

## Connecting your GitHub account

If your administrator has configured a GitHub App, **Connect with GitHub** appears above the import settings. Approve access on GitHub, return to Karakeep, select **My connected GitHub account**, and save your destination and import mode. Your Karakeep login stays unchanged. Account connection and import mode are separate choices: either source supports a one-time import or daily synchronization.

This version imports public repositories only, including stars GitHub makes available through your authorization. Private repositories are skipped. It does not copy repository contents or write stars back to GitHub.

Reconnecting or disconnecting the account stops its configured import. Existing bookmarks remain. After reconnecting, save the import settings again. Disconnect removes stored credentials from Karakeep; to revoke authorization at GitHub as well, remove the app under your GitHub account's **Settings → Applications → Authorized GitHub Apps**.

### Administrator setup

1. Register a GitHub App for your Karakeep installation. This is separate from Karakeep's login provider.
2. Set its callback URL to `https://your-karakeep.example/api/github-stars/callback`, matching the configured `NEXTAUTH_URL`.
3. Request the **Starring** account permission, **read-only**. No repository write permissions are needed. You do not need to enable webhooks for this integration.
4. Keep expiring user access tokens enabled. Karakeep refreshes them automatically while their refresh token remains valid.
5. Configure `GITHUB_STARS_CLIENT_ID` and `GITHUB_STARS_CLIENT_SECRET` on both the web application and workers. Use your deployment's secret configuration, not a checked-in file.
6. Ensure both processes use the same persistent `NEXTAUTH_SECRET`. It protects stored connection credentials; changing it requires users to reconnect.
7. Restart the web application and workers. Test connecting, importing, reconnecting and disconnecting with your GitHub account before enabling this for other users.

Without the client ID and secret, the connection option stays hidden and username-based public imports remain available. A revoked or expired authorization is shown as a sync error and requires reconnecting. Tokens are stored encrypted and are never returned by the settings API.
