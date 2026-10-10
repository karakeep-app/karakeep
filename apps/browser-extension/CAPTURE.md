# Saving the open page

Client-side crawling captures the current tab's live DOM with SingleFile. It does
not send website cookies to Karakeep or ask the server to sign in. The capture
includes rendered text; it is a static archive, not a working copy of a site's
scripts, embedded frames, or video player. Protected resources that cannot be
fetched by the browser may still be missing.

The popup starts a background save and observes its progress in session storage.
Closing the popup does not own or cancel the save. If the browser terminates the
background worker, reopening the popup reports the interrupted operation and
provides Retry. Closing the browser clears session progress; this is not a
persistent offline upload queue.

The operation captures, uploads, creates or finds the bookmark, attaches the
snapshot, and queues processing where needed. A retry reuses known upload and
bookmark IDs. Re-saving a URL replaces its previous browser snapshot using the
existing asset API. Capture/upload errors do not silently become URL-only saves:
the user must explicitly choose **Save link only**. The snapshot is only attached
to its source page; saving a different context-menu target remains a link save.

Capture uses active-tab access when available. A failed capture offers a
site-specific permission request; access to every website is not a prerequisite.
The preview and archive download prefer the browser snapshot when one exists.

## Verification

From the repository root:

```sh
pnpm typecheck --filter=@karakeep/browser-extension
pnpm lint --filter=@karakeep/browser-extension
pnpm format --filter=@karakeep/browser-extension
pnpm test --filter=@karakeep/browser-extension
pnpm build --filter=@karakeep/browser-extension
```

The packaged-browser regression uses a disposable Chromium profile and a local
fixture API. Install Playwright's Chromium if it is not already available, then
run from `apps/browser-extension`:

```sh
pnpm exec playwright install chromium
pnpm run test:browser
```

It verifies authenticated live DOM capture without reloading the document,
completion after the extension UI closes, refreshing an existing snapshot, and
an upload failure that does not create a URL-only bookmark. Its temporary
manifest grants the fixture origin, so this test does not establish Safari or
active-tab permission acceptance. API tests use isolated test databases.

## Safari development build

Changing this checkout does not update an App Store installation. On macOS with
Xcode installed, build the extension and convert `dist` to a separate development
app. Use a fresh project directory:

```sh
xcrun safari-web-extension-converter dist \
  --project-location /tmp/karakeep-capture-dev \
  --app-name 'Karakeep Capture Dev' \
  --bundle-identifier app.karakeep.capture.dev \
  --macos-only --copy-resources --no-open --no-prompt
```

Open the generated Xcode project and configure development signing. Check that
the app bundle identifier is `app.karakeep.capture.dev` and the extension is
`app.karakeep.capture.dev.Extension`; the converter may substitute the app name
in the parent identifier. Run the project to make the development extension
available in Safari. Enable that extension and
configure its Karakeep connection. Use only one Karakeep extension during the
test to avoid confusing the development build with the App Store installation.
The converter may warn about manifest keys; packaging or compiling the wrapper
alone does not prove that Safari ran the JavaScript successfully.

Manual acceptance in Safari:

- Allow the target site, enable client-side crawling, and save a signed-in page.
  Verify the **Archived page** contains text visible in the open tab.
- Re-save the same URL after its visible content changes and check the archive.
- Close the popup during capture/upload, then reopen it to check completion.
- Deny site access or interrupt the upload. Verify the error, Retry, and explicit
  Save link only behavior.
- Navigate the source tab during capture and verify the wrong document is not
  attached. Verify saving a different context-menu link does not capture the
  source page.

Deploying the web/server changes is also necessary for the updated archive
selection in Karakeep's viewer. Reader extraction is separate from the full
browser archive and may omit non-article content.

## Reader processing and embedded resources

A successfully saved archive can still have no Reader View if the backend parser
fails. An authenticated Anizium archive reproduced a heap exhaustion at the
parser's default 512 MB limit even though Readability could extract its text.

The worker parser now substitutes short, per-run data URIs for large embedded
base64 resources during metadata and Reader extraction. It restores the original
resource bytes in the output before storage. The uploaded archive stays intact;
tiny lazy-loading placeholders retain their original behavior.

This fix requires rebuilding and deploying the modified backend worker (or the
server image containing it). Installing the extension or the official v0.33.2
image alone does not install this local patch. After deploying, request a
re-crawl of the affected bookmark to process its existing browser archive again.
No database migration is needed for this parser change.

The parser regressions run with synthetic archives and a 512 MB subprocess heap:

```sh
cd apps/workers
pnpm exec vitest run scripts/parseHtmlSubprocess.test.ts workers/utils/embeddedDataUris.test.ts workers/utils/readerViewAssessment.test.ts
```

As a configuration-only workaround, the original parser successfully processed
that same archive locally with `CRAWLER_PARSER_MEM_LIMIT_MB=1024`. This raises the
limit to 1 GB per parsing subprocess and requires sufficient host/container
memory. Apply it to the worker environment, restart the worker, and request a
re-crawl. The compaction fix succeeds at the existing 512 MB default instead.

## Save recovery and archive ordering

Reopening the popup subscribes to updates and reads the latest save again after
reconnect initialization, so an older reply cannot hide completion. A failed
save can be discarded locally before saving with the current connection; this
does not delete content from the previous server or account.

Every save job sends its stable `clientRequestId` on create retries. The updated
backend stores the key per user with a payload hash and a unique constraint, so
retrying a text save after losing the response returns the existing bookmark.
These guarantees require the updated backend; older servers ignore the key.

Migration `0095_save_retry_and_archive_order` adds the create-request fields and
asset upload timestamps. Detail, list, and crawler queries order archives by
upload time, then asset ID. Legacy assets retain a null timestamp because their
capture time is unknown; they sort before timestamped assets, with IDs providing
a stable fallback order. Deploy the migration with the backend changes.

CI runs the extension unit tests, builds the production extension, installs
Chromium, and runs the packaged capture regression.
