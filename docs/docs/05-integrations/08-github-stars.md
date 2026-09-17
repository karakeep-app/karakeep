# GitHub Stars

Karakeep can import a GitHub user's publicly starred repositories into a manual list, without a GitHub token or a separate service.

1. Create a manual list in Karakeep.
2. Open **Settings → GitHub Stars**.
3. Enter the GitHub username and choose a list you own. This mode only reads publicly visible stars. A private profile may return no results; hidden stars and private repositories are not accessible.
4. Optionally enable importing repository topics as tags, then save.

The workers begin importing within about a minute. Each job imports up to 100 repositories. Larger collections continue page by page. After a complete import, Karakeep checks again in 24 hours. **Sync now** requests an earlier check, unless GitHub has asked the server to wait.

Existing bookmarks are reused without changing their notes, favourite status or archived state. Topic import only adds tags. Removing a GitHub star, pausing or disconnecting does not remove any bookmarks or tags. Deleting the destination list also removes its synchronization configuration. Settings changes and disconnect are unavailable while a batch is running. Wait for that batch to finish, then retry. Changing settings restarts the scan; existing imported bookmarks remain. If you delete a bookmark or remove it from the destination list while the repository is still starred, the next scan imports it again.

## Limits and status

The settings page shows the last complete synchronization, next check and any error. A failed page is retried without marking the whole import as complete. You can retry ordinary failures immediately with **Sync now**; GitHub rate-limit cooldowns must expire first. An empty successful scan does not distinguish a profile with hidden stars from one with no stars. Public GitHub API limits are shared by all users on the same server IP, so large collections and multiple subscriptions can take longer. Imports are not an atomic snapshot of GitHub: stars changed during pagination may be picked up by the next complete scan.

Private repositories, GitHub Enterprise, OAuth and live star-count metadata are not included. This feature does not depend on custom bookmark metadata.

Self-hosted installations must run the `githubStars` worker. If using `WORKERS_ENABLED_WORKERS`, add `githubStars` to that list. It can be disabled with `WORKERS_DISABLED_WORKERS=githubStars`.
