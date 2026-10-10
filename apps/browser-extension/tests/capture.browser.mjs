// Run after `pnpm build --filter=@karakeep/browser-extension`.
// Uses a disposable Chromium profile, a copy of dist, and a local fixture API.
// This verifies the packaged extension, not Safari or a production server.
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const temporary = await mkdtemp(join(tmpdir(), "karakeep-capture-"));
const uploads = [];
const calls = [];
const fixtureErrors = [];
let attachedAsset;
let exists = false;
let pageRequests = 0;
let failedUpload = false;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://fixture.test");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/private") {
      pageRequests++;
      res.setHeader("Content-Type", "text/html");
      const signedIn = req.headers.cookie?.includes(
        "fixture-session=signed-in",
      );
      res.end(
        `<!doctype html><html><head><title>Private fixture</title></head><body><h1>${signedIn ? "SIGNED_IN_CONTENT" : "SIGN_IN_REQUIRED"}</h1><main id="content"></main></body></html>`,
      );
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(req.headers.authorization, "Bearer fixture-key");
    if (url.pathname === "/api/assets") {
      const form = await new Request("http://fixture.test", {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] },
        body,
      }).formData();
      uploads.push(await form.get("file").text());
      // Leave time to close the popup/driver while the upload is in flight.
      await delay(300);
      res.setHeader("Content-Type", "application/json");
      if (failedUpload) {
        res.writeHead(413);
        res.end('{"error":"too large"}');
        return;
      }
      res.end(JSON.stringify({ assetId: `snapshot-${uploads.length}` }));
      return;
    }
    assert(url.pathname.startsWith("/api/trpc/"));
    const methods = url.pathname.slice("/api/trpc/".length).split(",");
    const input = JSON.parse(
      body.length ? body.toString() : url.searchParams.get("input") || "{}",
    );
    const output = methods.map((method, index) => {
      calls.push(method);
      const args = input[index]?.json;
      let result;
      if (method === "bookmarks.createBookmark") {
        if (!exists) attachedAsset = args.precrawledArchiveId;
        result = { id: "fixture-bookmark", alreadyExists: exists };
        exists = true;
      } else if (method === "bookmarks.getBookmark") {
        result = {
          assets: attachedAsset
            ? [{ id: attachedAsset, assetType: "precrawledArchive" }]
            : [],
        };
      } else if (method === "assets.replaceAsset") {
        assert.equal(args.oldAssetId, attachedAsset);
        attachedAsset = args.newAssetId;
        result = null;
      } else if (method === "assets.attachAsset") {
        attachedAsset = args.asset.id;
        result = { id: attachedAsset, assetType: "precrawledArchive" };
      } else if (method === "bookmarks.recrawlBookmark") {
        result = null;
      } else {
        throw new Error(`Unexpected API call: ${method}`);
      }
      return { result: { data: { json: result } } };
    });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(output));
  } catch (error) {
    fixtureErrors.push(error);
    console.error(error);
    res.writeHead(500);
    res.end("Fixture failure");
  }
});
let context;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const extension = join(temporary, "extension");
  await cp(new URL("../dist", import.meta.url), extension, { recursive: true });
  const manifestPath = join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // A fixture-only site grant avoids native permission prompts in headless CI.
  // The shipped manifest is unchanged and activeTab is tested separately by hand.
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(
    join(extension, "capture-test.html"),
    "<!doctype html><title>Capture test driver</title>",
  );
  context = await chromium.launchPersistentContext(join(temporary, "profile"), {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(async (address) => {
    await chrome.storage.sync.set({
      settings: {
        address,
        apiKey: "fixture-key",
        useSingleFile: true,
        singleFileIncludeImages: true,
        autoSave: true,
      },
    });
  }, base);
  await context.addCookies([
    { name: "fixture-session", value: "signed-in", url: base },
  ]);
  const page = await context.newPage();
  await page.goto(`${base}/private`);
  await page.locator("#content").evaluate((el) => {
    el.textContent = "LIVE_DOM_AFTER_LOAD";
  });
  const tabId = await worker.evaluate(
    async (url) =>
      (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
    page.url(),
  );
  const request = {
    type: "START_SAVE",
    tabId,
    tabUrl: page.url(),
    bookmark: {
      type: "link",
      url: page.url(),
      title: "Private fixture",
      source: "extension",
    },
  };
  const driver = async () => {
    const tab = await context.newPage();
    await tab.goto(`chrome-extension://${extensionId}/capture-test.html`);
    return tab;
  };
  const waitForJob = async (stage) => {
    for (let i = 0; i < 200; i++) {
      const job = await worker.evaluate(
        async (id) =>
          (await chrome.storage.session.get(`karakeep-save:${id}`))[
            `karakeep-save:${id}`
          ],
        tabId,
      );
      if (job?.stage === stage) return job;
      if (job?.stage === "failed" && stage !== "failed")
        throw new Error(JSON.stringify(job));
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${stage}`);
  };
  let popup = await driver();
  const reply = await popup.evaluate(
    (message) => chrome.runtime.sendMessage(message),
    request,
  );
  assert(!reply.error, reply.error);
  await popup.close();
  await waitForJob("saved");
  assert(uploads[0].includes("SIGNED_IN_CONTENT"));
  assert(uploads[0].includes("LIVE_DOM_AFTER_LOAD"));
  assert(!uploads[0].includes("SIGN_IN_REQUIRED"));
  assert.equal(pageRequests, 1, "capture must not reload the main document");
  assert.equal(attachedAsset, "snapshot-1");
  console.log(
    "PASS: packaged extension captures authenticated live DOM and saves after popup closure",
  );

  await page.locator("#content").evaluate((el) => {
    el.textContent = "UPDATED_LIVE_DOM";
  });
  popup = await driver();
  const resave = await popup.evaluate(
    (message) => chrome.runtime.sendMessage(message),
    request,
  );
  assert(!resave.error, resave.error);
  await waitForJob("saved");
  assert(uploads[1].includes("UPDATED_LIVE_DOM"));
  assert.equal(attachedAsset, "snapshot-2");
  assert(calls.includes("assets.replaceAsset"));
  console.log("PASS: re-saving replaces the previous browser snapshot");

  failedUpload = true;
  const countBefore = calls.filter(
    (method) => method === "bookmarks.createBookmark",
  ).length;
  await popup.evaluate(
    (message) => chrome.runtime.sendMessage(message),
    request,
  );
  const failure = await waitForJob("failed");
  assert.equal(failure.failedStage, "uploading");
  assert.equal(
    calls.filter((method) => method === "bookmarks.createBookmark").length,
    countBefore,
  );
  assert.equal(attachedAsset, "snapshot-2");
  console.log("PASS: failed upload does not silently save a URL-only bookmark");
  assert.deepEqual(fixtureErrors, []);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
