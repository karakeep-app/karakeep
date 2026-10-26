// Waits out non-interactive bot-protection challenges (e.g. Cloudflare's
// "Just a moment..." page or DataDome's device check). These interstitials run
// some JS and then reload into the real page on their own when the browser
// passes. Capturing right after the initial load would store the challenge
// page instead, so when one is detected we give it a bounded amount of time to
// clear.
import type { Page } from "patchright";
import { abortRace, raceWith } from "utils";

import { setSpanAttributes } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { isLikelyChallengePage, isWaitableChallenge } from "./metadataResolver";

// Statuses bot-protection vendors serve their interstitials with.
const CHALLENGE_STATUS_CODES = new Set([401, 403, 429, 503]);

const POLL_INTERVAL_MS = 500;
const SETTLE_TIMEOUT_MS = 5000;

async function pageIsWaitableChallenge(page: Page): Promise<boolean> {
  try {
    const [title, htmlContent] = await Promise.all([
      page.title(),
      page.content(),
    ]);
    return isWaitableChallenge(title, htmlContent);
  } catch {
    // The page is navigating (typically the challenge reloading into the real
    // page); treat it as still pending and check again on the next poll.
    return true;
  }
}

/**
 * If the page looks like a self-clearing bot challenge, waits (up to
 * CRAWLER_CHALLENGE_WAIT_SEC) for it to go away and for the resulting page to
 * settle. Returns without waiting for regular pages.
 */
export async function waitForChallengeToClear(
  page: Page,
  statusCode: number,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<void> {
  const waitMs = serverConfig.crawler.challengeWaitSec * 1000;
  if (waitMs <= 0) {
    return;
  }
  // Cheap gate so regular pages don't pay for serializing their DOM.
  const title = await page.title().catch(() => "");
  if (
    !CHALLENGE_STATUS_CODES.has(statusCode) &&
    !isLikelyChallengePage({ title })
  ) {
    return;
  }
  if (!(await pageIsWaitableChallenge(page))) {
    return;
  }

  logger.info(
    `[Crawler][${jobId}] The page looks like a bot challenge, waiting up to ${serverConfig.crawler.challengeWaitSec}s for it to clear`,
  );
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;
  let cleared = false;
  while (Date.now() < deadline) {
    await raceWith<unknown>(
      new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)),
      abortRace(abortSignal),
    );
    if (!(await pageIsWaitableChallenge(page))) {
      cleared = true;
      break;
    }
  }

  if (cleared) {
    await page
      .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined);
  }
  abortSignal.throwIfAborted();
  const waitedMs = Date.now() - startedAt;
  setSpanAttributes({
    "crawler.challenge.cleared": cleared,
    "crawler.challenge.waitMs": waitedMs,
  });
  logger.info(
    `[Crawler][${jobId}] Bot challenge ${cleared ? "cleared" : "did not clear"} after ${waitedMs}ms`,
  );
}
