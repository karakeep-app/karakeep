// Auto-dismisses consent-management-platform (CMP) dialogs in the crawler's
// browser using DuckDuckGo's autoconsent (Consent-O-Matic-style rules). This
// runs entirely in the page (DOM manipulation, no network requests of its
// own), so it improves screenshots, PDFs, monolith archives AND the captured
// HTML that feeds extraction. Gated by CRAWLER_ENABLE_AUTOCONSENT.
//
// We inject the package's self-contained standalone bundle: it embeds the
// compact rule set, runs in the page's main world and performs the configured
// action automatically, so no Node <-> page messaging is needed. Each frame
// runs its own instance; the wait helper tracks all frames because many CMPs
// (e.g. Sourcepoint) keep their dialog in a cross-origin iframe.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Frame, Page } from "patchright";

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

// Cap on how long we wait for autoconsent to detect a CMP.
const AUTOCONSENT_WAIT_MS = 3000;
// Cap on how long a detected CMP gets to finish its opt-in/opt-out flow. This
// is separate from the detection budget because some CMPs open a second
// preferences frame and need longer than the initial 3 seconds.
const AUTOCONSENT_CMP_WAIT_MS = 5000;
const AUTOCONSENT_POLL_MS = 100;
const AUTOCONSENT_FRAME_READ_TIMEOUT_MS = 100;

// Pause after a successful opt-out so dialogs that animate out after the click
// don't end up half-faded in the screenshot.
const DISMISS_SETTLE_MS = 500;

// Lifecycle states in which autoconsent is still detecting a CMP.
const PENDING_STATES = [
  "loading",
  "initialized",
  "waitingForInitResponse",
  "started",
];
// Lifecycle states in which a CMP was found and is being handled.
const CMP_ACTIVE_STATES = [
  "cmpDetected",
  "openPopupDetected",
  "runningOptOut",
  "runningOptIn",
];
// Lifecycle states in which autoconsent has successfully handled a CMP.
const SUCCESS_STATES = ["done", "optOutSucceeded", "optInSucceeded"];

let script: string | undefined;
let loadAttempted = false;

/**
 * The standalone bundle hard-codes its config, so set the requested action by
 * replacing the marker at the start of that config object.
 */
function withAutoconsentAction(
  source: string,
  action: "optOut" | "optIn",
): string {
  const marker = "isMainWorld: true,";
  if (!source.includes(marker)) {
    logger.warn(
      "[crawler] Couldn't configure the autoconsent action; using its default opt-out behavior.",
    );
    return source;
  }
  return source.replace(marker, `${marker}\n      autoAction: "${action}",`);
}

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
    const source = readFileSync(
      path.join(path.dirname(pkgMain), "autoconsent.standalone.js"),
      "utf8",
    );
    script = withAutoconsentAction(
      source,
      serverConfig.crawler.autoconsentAction,
    );
    logger.info(
      `[crawler] Loaded autoconsent CMP rules (${serverConfig.crawler.autoconsentAction}).`,
    );
  } catch (e) {
    logger.error(
      `[crawler] Failed to load autoconsent. CMP auto-dismissal disabled: ${e}`,
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
 * Reads the autoconsent lifecycle of one frame. patchright's page.evaluate
 * defaults to an isolated world, so use waitForFunction, which runs in the
 * page's main world where the bundle lives. Frames without autoconsent, or
 * that detach while reading, are ignored.
 */
async function readFrameLifecycle(frame: Frame): Promise<string | undefined> {
  try {
    const handle = await frame.waitForFunction(
      () => globalThis.autoconsentStandalone?.instance?.state?.lifecycle,
      undefined,
      {
        timeout: AUTOCONSENT_FRAME_READ_TIMEOUT_MS,
        polling: 10,
      },
    );
    const lifecycle = await handle.jsonValue();
    await handle.dispose();
    return typeof lifecycle === "string" ? lifecycle : undefined;
  } catch {
    return undefined;
  }
}

async function readLifecycles(page: Page): Promise<string[]> {
  const states = await Promise.all(page.frames().map(readFrameLifecycle));
  return states.filter((state): state is string => state !== undefined);
}

async function waitBeforeNextPoll(abortSignal: AbortSignal): Promise<void> {
  await sleep(AUTOCONSENT_POLL_MS, undefined, { signal: abortSignal }).catch(
    () => undefined,
  );
  abortSignal.throwIfAborted();
}

/**
 * Waits until autoconsent has detected a CMP (if any) and then until every
 * frame that found one has finished its opt-in/opt-out flow. Returns whether a
 * CMP was successfully handled.
 *
 * No-CMP pages settle in `nothingDetected` on their own, so they only spend the
 * usual detection budget and never enter the longer CMP wait.
 */
async function waitForAutoconsent(
  page: Page,
  abortSignal: AbortSignal,
): Promise<boolean> {
  let foundCmp = false;
  const detectionDeadline = Date.now() + AUTOCONSENT_WAIT_MS;
  while (Date.now() < detectionDeadline) {
    const states = await readLifecycles(page);
    foundCmp = states.some((state) => CMP_ACTIVE_STATES.includes(state));
    if (foundCmp) {
      break;
    }
    // Once every frame that runs autoconsent has settled, there is no CMP to
    // wait for. Frames without the script are not included in `states`.
    if (
      states.length > 0 &&
      states.every((state) => !PENDING_STATES.includes(state))
    ) {
      return false;
    }
    await waitBeforeNextPoll(abortSignal);
  }
  if (!foundCmp) {
    return false;
  }

  let handled = false;
  const cmpDeadline = Date.now() + AUTOCONSENT_CMP_WAIT_MS;
  while (Date.now() < cmpDeadline) {
    const states = await readLifecycles(page);
    handled ||= states.some((state) => SUCCESS_STATES.includes(state));
    if (!states.some((state) => CMP_ACTIVE_STATES.includes(state))) {
      break;
    }
    await waitBeforeNextPoll(abortSignal);
  }

  if (handled) {
    await sleep(DISMISS_SETTLE_MS, undefined, { signal: abortSignal }).catch(
      () => undefined,
    );
    abortSignal.throwIfAborted();
  }
  return handled;
}

/**
 * Waits for the page to settle and for autoconsent to finish, in parallel.
 * Detection has its own budget, and an active CMP gets a separate, slightly
 * longer one because CMPs often open a preferences frame before they finish.
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
  await Promise.all([pageLoad, waitForAutoconsent(page, abortSignal)]);
}
