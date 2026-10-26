// Auto-dismisses consent-management-platform (CMP) dialogs in the crawler's
// browser using DuckDuckGo's autoconsent (Consent-O-Matic-style opt-out rules).
// This runs entirely in the page (DOM manipulation, no network requests of its
// own), so it improves screenshots, PDFs, monolith archives AND the captured
// HTML that feeds extraction. Gated by CRAWLER_ENABLE_AUTOCONSENT.
//
// We inject the package's self-contained standalone bundle: it embeds the
// compact rule set, runs in the page's main world and opts out automatically,
// so no Node <-> page messaging is needed. Each frame runs its own instance;
// we only track the main frame's progress to decide when to capture.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "patchright";
import { abortRaceResolve, raceWith } from "utils";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

// Set by the standalone bundle on the page's global object. In a browser
// `globalThis === window`; declaring it here keeps the waitForFunction callback
// typed without pulling the DOM lib into the workers tsconfig.
declare global {
  // eslint-disable-next-line no-var
  var autoconsentStandalone:
    | { instance: { state: { lifecycle: string } } }
    | undefined;
}

// Cap on how long each wait for autoconsent lasts.
const AUTOCONSENT_WAIT_MS = 3000;

// Pause after a successful opt-out so dialogs that animate out after the click
// don't end up half-faded in the screenshot.
const DISMISS_SETTLE_MS = 500;

// Lifecycle states in which autoconsent has found a CMP and is still opting out.
const OPTING_OUT_STATES = ["cmpDetected", "openPopupDetected", "runningOptOut"];
// Lifecycle states in which autoconsent has successfully opted out.
const OPTED_OUT_STATES = ["done", "optOutSucceeded"];
// Lifecycle states in which autoconsent is still working (detecting or opting
// out). Missing state (script not running yet) counts as "loading".
const PENDING_STATES = [
  "loading",
  "initialized",
  "waitingForInitResponse",
  "started",
  ...OPTING_OUT_STATES,
];

let script: string | undefined;
let loadAttempted = false;

/**
 * Loads the autoconsent standalone bundle once (module-level, like the
 * adblocker). No-op when CRAWLER_ENABLE_AUTOCONSENT is false or on any load
 * error (autoconsent is then simply disabled — never fatal).
 */
export function loadAutoconsent(): void {
  if (loadAttempted) {
    return;
  }
  loadAttempted = true;
  if (!serverConfig.crawler.enableAutoconsent) {
    return;
  }
  try {
    const require = createRequire(import.meta.url);
    // The standalone bundle is a sibling of the package's main entry; it is not
    // a declared export, so resolve the package then walk to the sibling file.
    const pkgMain = require.resolve("@duckduckgo/autoconsent");
    script = readFileSync(
      path.join(path.dirname(pkgMain), "autoconsent.standalone.js"),
      "utf8",
    );
    logger.info("[crawler] Loaded autoconsent CMP opt-out rules.");
  } catch (e) {
    logger.error(
      `[crawler] Failed to load autoconsent. CMP auto-opt-out disabled: ${e}`,
    );
  }
}

/**
 * Installs autoconsent on a freshly-created page. Must be called AFTER the SSRF
 * request router and redirect guard are in place (it injects scripts;
 * conservative ordering). Returns whether autoconsent is active on the page
 * (never fatal to a crawl).
 */
export async function installAutoconsent(
  page: Page,
  jobId: string,
): Promise<boolean> {
  if (!script) {
    return false;
  }
  try {
    await page.addInitScript(script);
    return true;
  } catch (e) {
    logger.warn(
      `[Crawler][${jobId}] Failed to install autoconsent on the page: ${e}`,
    );
    return false;
  }
}

/**
 * Waits (capped at AUTOCONSENT_WAIT_MS, abort-aware) until the main frame's
 * autoconsent lifecycle leaves `pendingStates`, and returns that lifecycle
 * (undefined on timeout/abort). Reads it through waitForFunction, which runs in
 * the page's main world (where the bundle lives) in both Playwright and
 * patchright; patchright's page.evaluate defaults to an isolated world.
 */
async function waitWhileIn(
  page: Page,
  pendingStates: string[],
  abortSignal: AbortSignal,
): Promise<string | undefined> {
  return await raceWith<string | undefined>(
    page
      .waitForFunction(
        (pending) => {
          const lifecycle =
            globalThis.autoconsentStandalone?.instance.state.lifecycle ??
            "loading";
          return pending.includes(lifecycle) ? false : lifecycle;
        },
        pendingStates,
        { timeout: AUTOCONSENT_WAIT_MS, polling: 100 },
      )
      .then(async (handle) => (await handle.jsonValue()) || undefined)
      .catch(() => undefined),
    abortRaceResolve(abortSignal, undefined),
  );
}

/**
 * Waits for the page to settle and for autoconsent to finish, in parallel.
 *
 * No-CMP detection can take longer than our autoconsent budget because the
 * library retries detection several times, so waiting for it after the page
 * load wait would add the full timeout to ordinary pages. If a CMP appears
 * after the initial autoconsent wait timed out, wait once more for the actual
 * opt-out before capture. After a successful opt-out, give the dialog a moment
 * to animate out.
 */
export async function waitForPageLoadAndAutoconsent(
  page: Page,
  pageLoad: Promise<unknown>,
  autoconsentEnabled: boolean,
  abortSignal: AbortSignal,
): Promise<void> {
  if (!autoconsentEnabled) {
    await pageLoad;
    return;
  }
  await Promise.all([pageLoad, waitWhileIn(page, PENDING_STATES, abortSignal)]);
  const lifecycle = await waitWhileIn(page, OPTING_OUT_STATES, abortSignal);
  if (lifecycle && OPTED_OUT_STATES.includes(lifecycle)) {
    await sleep(DISMISS_SETTLE_MS, undefined, { signal: abortSignal }).catch(
      () => undefined,
    );
  }
}
