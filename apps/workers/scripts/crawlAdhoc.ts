import "dotenv/config";

import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

/**
 * Adhoc crawl CLI — drives the REAL crawlPage() browser-fetch path without the
 * queue, DB job, or downstream (inference/search/archival) machinery. Meant for
 * manual debugging and for the crawler A/B test (021-crawler-stealth-ab-test).
 *
 * DB safety: crawlPage() with the override does NOT read or write any app data
 * (the per-user lookup is skipped; asset/bookmark/search/webhook writes live in
 * downstream functions this CLI never calls). BUT importing the crawler module
 * transitively opens a SQLite connection (packages/db/drizzle.ts) against
 * DATA_DIR. To guarantee we never touch the real DB, this bootstrap repoints
 * DATA_DIR at a throwaway temp dir BEFORE any app module is imported. Set
 * KARAKEEP_ADHOC_USE_REAL_DB=1 to opt out and use the configured DB instead.
 *
 * The two anti-detection levers are controlled purely by env, so the test
 * driver can flip them per attempt:
 *   BROWSER_WEB_URL                      -> which Chrome container (flags arm)
 *   REBROWSER_PATCHES_RUNTIME_FIX_MODE   -> "0" disables the rebrowser patch
 *
 * Usage:
 *   BROWSER_WEB_URL=http://127.0.0.1:9222 \
 *     tsx scripts/crawlAdhoc.ts --url https://example.com --repeats 3 \
 *       --arm baseline --out results.jsonl
 *   (use 127.0.0.1, not localhost — Chrome's DevTools host check rejects [::1])
 */

// Repoint the DB at a throwaway location before importing anything that pulls
// in @karakeep/db. Static imports above are node built-ins + dotenv only.
if (process.env.KARAKEEP_ADHOC_USE_REAL_DB !== "1") {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "karakeep-adhoc-"));
  process.env.DATA_DIR = scratch;
  process.env.ASSETS_DIR = path.join(scratch, "assets");
  mkdirSync(process.env.ASSETS_DIR, { recursive: true });
}

// Interstitial-only markers: strings that appear on an actual challenge/block
// PAGE, not merely in the bot-management scripts (e.g. /cdn-cgi/challenge-platform,
// px-captcha, _px3) that Cloudflare/PerimeterX inject on normal pages too. Using
// those loose tokens false-positives real content as blocked. Matched
// case-insensitively; only trusted when the page is also small (see scoreHtml).
const BLOCK_MARKERS = [
  "just a moment",
  "checking your browser",
  "attention required! | cloudflare",
  "enable javascript and cookies to continue",
  "verify you are human",
  "geo.captcha-delivery.com",
  "please verify you are a human",
];

// A challenge interstitial is small; real content pages are large. Above this
// size we trust a 200 as real even if a marker substring happens to appear.
const INTERSTITIAL_MAX_BYTES = 100_000;

function scoreHtml(
  statusCode: number,
  html: string,
): { blocked: boolean; marker: string | null } {
  // Status is the primary, low-false-positive signal.
  if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
    const lower = html.toLowerCase();
    return {
      blocked: true,
      marker: BLOCK_MARKERS.find((m) => lower.includes(m)) ?? "status",
    };
  }
  const lower = html.toLowerCase();
  const marker = BLOCK_MARKERS.find((m) => lower.includes(m)) ?? null;
  // Only treat a 2xx as blocked if it looks like a small interstitial.
  const blocked = marker !== null && html.length < INTERSTITIAL_MAX_BYTES;
  return { blocked, marker: blocked ? marker : null };
}

async function main() {
  // Dynamic imports so the DATA_DIR override above takes effect first.
  const { default: serverConfig } = await import("@karakeep/shared/config");
  const { selectRunProxies } = await import("network");
  const { crawlPage, CrawlerWorker } = await import("workers/crawlerWorker");

  const { values } = parseArgs({
    options: {
      url: { type: "string", multiple: true },
      repeats: { type: "string", default: "1" },
      arm: { type: "string", default: "unlabeled" },
      out: { type: "string" },
      pdf: { type: "boolean", default: false },
      "screenshot-dir": { type: "string" },
      "timeout-sec": { type: "string", default: "60" },
    },
  });

  const urls = values.url ?? [];
  if (urls.length === 0) {
    console.error(
      "No --url provided. Example: tsx scripts/crawlAdhoc.ts --url https://example.com",
    );
    process.exit(2);
  }
  const repeats = Number(values.repeats);
  const timeoutMs = Number(values["timeout-sec"]) * 1000;
  const screenshotDir = values["screenshot-dir"];
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  console.error(
    `[adhoc] arm=${values.arm} browser=${serverConfig.crawler.browserWebUrl ?? "(browserless)"} ` +
      `rebrowserFix=${process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE === "0" ? "off" : "on"} ` +
      `db=${process.env.KARAKEEP_ADHOC_USE_REAL_DB === "1" ? "REAL" : "scratch"}`,
  );

  await CrawlerWorker.prepareForAdhoc();

  const runProxy = selectRunProxies();
  const lines: string[] = [];

  for (const url of urls) {
    for (let rep = 0; rep < repeats; rep++) {
      const jobId = `adhoc-${values.arm}-${rep}`;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      const startedAt = Date.now();
      let record: Record<string, unknown>;
      try {
        const res = await crawlPage(
          jobId,
          url,
          "adhoc",
          values.pdf,
          abort.signal,
          runProxy,
          // Force the full browser path and skip the per-user DB lookup.
          true,
        );
        const { blocked, marker } = scoreHtml(res.statusCode, res.htmlContent);
        if (screenshotDir && res.screenshot) {
          const safe = url.replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
          writeFileSync(
            path.join(screenshotDir, `${values.arm}-${safe}-${rep}.jpg`),
            res.screenshot,
          );
        }
        record = {
          arm: values.arm,
          url,
          finalUrl: res.url,
          rep,
          status: res.statusCode,
          blocked,
          marker,
          htmlLen: res.htmlContent.length,
          hasScreenshot: res.screenshot !== undefined,
          hasPdf: res.pdf !== undefined,
          latencyMs: Date.now() - startedAt,
          error: null,
        };
      } catch (e) {
        record = {
          arm: values.arm,
          url,
          finalUrl: null,
          rep,
          status: null,
          blocked: null,
          marker: null,
          htmlLen: 0,
          hasScreenshot: false,
          hasPdf: false,
          latencyMs: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
        };
      } finally {
        clearTimeout(timer);
      }
      const line = JSON.stringify(record);
      lines.push(line);
      console.error(
        `[adhoc] ${values.arm} ${url} rep=${rep} -> status=${record.status} blocked=${record.blocked} marker=${record.marker ?? "-"} htmlLen=${record.htmlLen}`,
      );
    }
  }

  const output = lines.join("\n") + "\n";
  if (values.out) {
    // Append so a driver can interleave many single-attempt invocations.
    appendFileSync(values.out, output);
  } else {
    process.stdout.write(output);
  }

  // crawlPage leaves the shared browser connection open; exit explicitly.
  process.exit(0);
}

void main();
