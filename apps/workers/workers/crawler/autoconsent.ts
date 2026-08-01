// Auto-dismisses consent-management-platform (CMP) dialogs in the crawler's
// browser using DuckDuckGo's autoconsent (Consent-O-Matic-style opt-out rules).
// This runs entirely in the page (DOM manipulation, no network requests of its
// own), so it improves screenshots, PDFs, monolith archives AND the captured
// HTML that feeds extraction. Gated by CRAWLER_ENABLE_AUTOCONSENT.
//
// Integration follows autoconsent's headless guide (docs/puppeteer.md): the
// bundled content script is injected via addInitScript and talks to Node over
// an exposed binding; Node replies with the config + rule bundle.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import type { Frame, Page } from "playwright";
import { abortRaceResolve, raceWith, timeoutRace } from "utils";
import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

// The content script exposes/consumes these on the page's global object. In a
// browser `globalThis === window`; declaring them here keeps the injected
// callbacks typed without pulling the DOM lib into the workers tsconfig.
declare global {
  // eslint-disable-next-line no-var
  var autoconsentReceiveMessage: ((message: unknown) => unknown) | undefined;
}

// Cap on how long we wait for autoconsent to finish detection and, when a CMP
// is found, finish opting out.
const AUTOCONSENT_WAIT_MS = 3000;

// Mirrors autoconsent's documented headless config with automatic opt-out.
const autoconsentConfig = {
  enabled: true,
  autoAction: "optOut",
  disabledCmps: [],
  enablePrehide: true,
  enableCosmeticRules: true,
  enableGeneratedRules: true,
  detectRetries: 20,
  isMainWorld: false,
  prehideTimeout: 2000,
  enableHeuristicDetection: true,
  heuristicMode: "tier2",
  logs: {
    lifecycle: false,
    rulesteps: false,
    detectionsteps: false,
    evals: false,
    errors: true,
    messages: false,
    waits: false,
  },
};

const autoconsentMessageSchema = z
  .object({
    type: z.string(),
    code: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    cmp: z.string().optional(),
    details: z.unknown().optional(),
    mainFrame: z.boolean().optional(),
    state: z
      .object({
        lifecycle: z.string(),
      })
      .optional(),
  })
  .passthrough();

interface AutoconsentBundle {
  script: string;
  rules: unknown;
}

let bundle: AutoconsentBundle | undefined;
let loadAttempted = false;

/**
 * Loads the autoconsent content-script bundle and rule set once (module-level,
 * like the adblocker). No-op when CRAWLER_ENABLE_AUTOCONSENT is false or on any
 * load error (autoconsent is then simply disabled — never fatal).
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
    // The playwright bundle is a sibling of the package's main entry; it is not
    // a declared export, so resolve the package then walk to the sibling file.
    const pkgMain = require.resolve("@duckduckgo/autoconsent");
    const scriptPath = path.join(
      path.dirname(pkgMain),
      "autoconsent.playwright.js",
    );
    const rulesPath =
      require.resolve("@duckduckgo/autoconsent/rules/rules.json");
    const script = readFileSync(scriptPath, "utf8");
    const rules: unknown = JSON.parse(readFileSync(rulesPath, "utf8"));
    bundle = { script, rules };
    logger.info("[crawler] Loaded autoconsent CMP opt-out rules.");
  } catch (e) {
    logger.error(
      `[crawler] Failed to load autoconsent. CMP auto-opt-out disabled: ${e}`,
    );
  }
}

export interface AutoconsentHandle {
  cmpDetected: () => boolean;
  detectionComplete: Promise<boolean>;
  done: Promise<void>;
}

/**
 * Installs autoconsent on a freshly-created page. Must be called AFTER the SSRF
 * request router and redirect guard are in place (autoconsent injects scripts;
 * conservative ordering). Returns a handle whose `done` promise resolves when
 * autoconsent finishes (or errors), or undefined when autoconsent is
 * unavailable/disabled or installation fails (never fatal to a crawl).
 */
export async function installAutoconsent(
  page: Page,
  jobId: string,
): Promise<AutoconsentHandle | undefined> {
  if (!bundle) {
    return undefined;
  }
  const { script, rules } = bundle;

  let cmpDetected = false;
  let resolveDetectionComplete: (detected: boolean) => void = () => undefined;
  const detectionComplete = new Promise<boolean>((resolve) => {
    resolveDetectionComplete = resolve;
  });
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const sendToFrame = (frame: Frame, message: unknown) =>
    frame
      .evaluate((msg) => {
        const receive = globalThis.autoconsentReceiveMessage;
        return receive ? receive(msg) : undefined;
      }, message)
      .catch(() => {
        // Page may have navigated/closed; nothing actionable.
      });

  try {
    await page.exposeBinding(
      "autoconsentSendMessage",
      async ({ frame }, raw: unknown): Promise<unknown> => {
        const parsed = autoconsentMessageSchema.safeParse(raw);
        if (!parsed.success) {
          return undefined;
        }
        const message = parsed.data;
        switch (message.type) {
          case "init":
            return sendToFrame(frame, {
              type: "initResp",
              config: autoconsentConfig,
              rules, // must include rules or no CMPs will be detected
            });
          case "eval": {
            if (typeof message.code !== "string") {
              return undefined;
            }
            const result = await frame.evaluate(message.code).catch(() => null);
            return sendToFrame(frame, {
              type: "evalResp",
              id: message.id,
              result,
            });
          }
          case "cmpDetected":
          case "popupFound":
            cmpDetected = true;
            resolveDetectionComplete(true);
            return undefined;
          case "autoconsentDone":
            resolveDetectionComplete(true);
            resolveDone();
            return undefined;
          case "autoconsentError":
            logger.warn(
              `[Crawler][${jobId}] autoconsent error: ${JSON.stringify(
                message.details,
              )}`,
            );
            resolveDetectionComplete(cmpDetected);
            resolveDone();
            return undefined;
          case "report":
            // A report from the main frame is authoritative for the page-level
            // "no CMP" result. Child frames can finish detection earlier while
            // the main frame is still looking for a delayed dialog.
            if (
              message.mainFrame === true &&
              message.state?.lifecycle === "nothingDetected"
            ) {
              resolveDetectionComplete(false);
            }
            return undefined;
          default:
            return undefined;
        }
      },
    );
    await page.addInitScript(script);
  } catch (e) {
    logger.warn(
      `[Crawler][${jobId}] Failed to install autoconsent on the page: ${e}`,
    );
    return undefined;
  }

  return { cmpDetected: () => cmpDetected, detectionComplete, done };
}

/**
 * Waits (capped at AUTOCONSENT_WAIT_MS, abort-aware) for detection to finish.
 * If a CMP is detected, also waits for autoconsent to finish opting out.
 */
export async function waitForAutoconsent(
  handle: AutoconsentHandle | undefined,
  abortSignal: AbortSignal,
): Promise<void> {
  if (!handle) {
    return;
  }

  const completion = handle.detectionComplete.then((detected) =>
    detected ? handle.done : undefined,
  );
  await raceWith<void>(
    completion,
    timeoutRace<void>(AUTOCONSENT_WAIT_MS, () => undefined),
    abortRaceResolve(abortSignal, undefined),
  );
}
