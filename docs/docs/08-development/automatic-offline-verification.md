# Automatic mobile downloads

The Downloads settings page can keep a configured number of recent link/text bookmarks available in the reader. Automatic downloads are disabled by default. Enabling the setting suggests 100 articles; valid counts are 1–1000.

Synchronization runs while the app is active and the server is reachable, no more than once every 15 minutes. Changing the count or archived-article preference starts a new synchronization; **Download recent articles now** bypasses the interval. Wi-Fi-only downloads are enabled by default; charging-only downloads are optional. Both controls apply to automatic runs and **Download recent articles now**, and both must be satisfied when enabled together. A full battery or charging paused by battery protection while connected to power qualifies as charging. Unknown or unavailable device state blocks the corresponding restricted download. Leaving Wi-Fi or unplugging cancels the current run and preserves saved copies; when conditions are restored, an interrupted run can restart while the app is active. Foregrounding rechecks device state before restricted downloads. These controls do not affect individual manual saves. Failed listing/download attempts and connectivity interruptions can retry when connectivity or device conditions recover; successful runs retain the 15-minute throttle.

Closing the app, losing connectivity, changing accounts, or cancelling stops the current run. This does not schedule operating-system background jobs.

**Exclude archived articles** is optional and off by default. When enabled, selection requests only unarchived bookmarks; a bookmark archived during a download is not saved. Existing manually saved articles remain protected, including archived ones. Old automatic copies are removed only after a complete successful refresh.

Article text uses the existing durable offline library. Remote images, video, PDFs, and complete archived pages are not downloaded by this feature. Successful downloads remain available across restarts independently of the temporary seven-day query cache.

Only automatic copies outside the latest selected articles are removed after a fully successful synchronization. Manually saved copies, including pre-existing offline articles, are preserved. Updating an automatic copy using the existing article save action makes it a manual copy. A scan is bounded to 50 pages. When the page cap or a repeated cursor prevents completing selection, the articles already found are downloaded and cleanup is skipped. A persistent deletion journal makes automatic cleanup recoverable after interrupted or failed storage operations. An incomplete or cancelled download keeps previous copies, so storage can temporarily exceed the configured article count. Switching automatic downloads off keeps existing copies. **Remove all offline content** disables automatic downloads and removes both manual and automatic copies.

Each scheduled refresh re-downloads selected articles to update their reader content. Each save also rewrites the manifest; configuring 1000 articles can therefore cause substantial recurring network and storage work, especially on low-end devices. A smaller count reduces that cost.

## Automated verification

From the repository root:

```sh
pnpm --filter @karakeep/mobile test
pnpm --filter @karakeep/mobile typecheck
pnpm --filter @karakeep/mobile lint
pnpm --filter @karakeep/mobile format
```

Tests cover bounded pagination, deduplication, unsupported asset types, cancellation, partial failures, selection/cleanup, and manual-save protection with mocked native storage. Restriction tests cover each policy combination, unknown/failed readings, changes during requests, foreground refresh, stale reads, and listener cleanup. Provider tests exercise failure/reconnect recovery and charging states with mocked native APIs; storage tests inject journal, manifest, and deletion failures to verify recovery. They do not establish device rendering or operating-system behavior.

## Device verification

1. Rebuild the native development app after adding `expo-battery`, then start a development server and the native mobile app following the setup guide. Use a test account with more articles than the configured count, plus text notes and PDF/image bookmarks.
2. Manually save an older article. Enable automatic downloads with a small count, wait for completion, and confirm the newest supported articles appear with an automatic-save label while the older manual copy remains.
3. Enter airplane mode and open the saved articles. Confirm text remains readable. Uncached remote images are an expected limitation.
4. Restart the app offline and repeat the text-reading check.
5. Reconnect and reduce the article count. Confirm only old automatic copies are evicted after a successful refresh. Explicitly update an automatic copy and confirm it survives subsequent cleanup.
6. Cancel a refresh, background the app during a download, and interrupt network access. Confirm completed copies remain and the status accurately reports an interrupted/incomplete run.
7. Switch accounts during a download and check that a late response cannot write into either the new account or the previous account after cancellation.
8. Enable Wi-Fi-only, switch to cellular, and confirm automatic and Download now actions wait. Return to Wi-Fi and confirm downloads can run. Switch to cellular mid-download and confirm no late response is saved and previous copies remain.
9. Enable charging-only, unplug, and confirm downloads wait. Plug in and confirm they can run, including with a full battery. Unplug mid-download and confirm it stops. Enable both controls and check neither condition alone permits downloads.
10. Background the app, change network/power conditions, and return. Confirm it waits for fresh readings. On a simulator or device where state is unavailable, confirm restricted downloads wait rather than bypassing the restriction.
11. Enable **Exclude archived articles** and confirm only recent unarchived articles are automatically selected. Archive one during a refresh and confirm it is skipped and no automatic cleanup occurs in that incomplete run. Confirm manually saved archived articles stay available.
12. Test a phone with optimized charging or an 80% battery-protection limit while plugged in. Confirm charging-only permits downloads.
13. Remove all offline content during a run. Confirm the setting is disabled and in-flight requests do not recreate copies.

An Android/iOS runtime is required for these device checks; do not describe them as passed based on unit tests alone.
