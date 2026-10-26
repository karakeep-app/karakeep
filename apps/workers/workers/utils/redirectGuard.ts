// A CDP-level guard on the crawler's browser page: blocks redirects into
// disallowed (internal/private) addresses, which Playwright's request routing
// doesn't see, and answers proxy auth challenges with the run's credentials.
import { matchesNoProxy, validateUrl } from "network";
import type {
  BrowserContext,
  BrowserContextOptions,
  CDPSession,
  Page,
} from "patchright";

import logger from "@karakeep/shared/logger";

function getHeaderValue(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === name)?.value;
}

/**
 * Installs a CDP-level guard that validates every redirect target before the
 * browser follows it (blocking redirects into disallowed/internal addresses)
 * and answers proxy auth challenges with the run's proxy credentials.
 */
export async function installRedirectGuard(
  context: BrowserContext,
  page: Page,
  jobId: string,
  proxyConfig: BrowserContextOptions["proxy"],
): Promise<CDPSession | undefined> {
  let cdpSession: CDPSession | undefined;

  try {
    cdpSession = await context.newCDPSession(page);
    const continuePausedRequest = async (requestId: string) => {
      await cdpSession
        ?.send("Fetch.continueRequest", { requestId })
        .catch(() => {
          // Ignore errors — the request may have been canceled.
        });
    };
    const failPausedRequest = async (requestId: string) => {
      await cdpSession
        ?.send("Fetch.failRequest", {
          requestId,
          errorReason: "BlockedByClient",
        })
        .catch(() => {
          // Ignore errors — the request may have been canceled.
        });
    };
    cdpSession.on("Fetch.authRequired", async (event) => {
      const authChallengeResponse =
        event.authChallenge.source === "Proxy" &&
        (proxyConfig?.username || proxyConfig?.password)
          ? {
              response: "ProvideCredentials" as const,
              username: proxyConfig.username ?? "",
              password: proxyConfig.password ?? "",
            }
          : { response: "Default" as const };
      await cdpSession
        ?.send("Fetch.continueWithAuth", {
          requestId: event.requestId,
          authChallengeResponse,
        })
        .catch(() => {
          // Ignore errors — the request may have been canceled.
        });
    });
    cdpSession.on("Fetch.requestPaused", async (event) => {
      try {
        const status = event.responseStatusCode;
        if (!status || status < 300 || status >= 400) {
          await continuePausedRequest(event.requestId);
          return;
        }

        const location = getHeaderValue(event.responseHeaders, "location");
        if (!location) {
          await continuePausedRequest(event.requestId);
          return;
        }

        const redirectUrl = new URL(location, event.request.url).toString();
        const redirectIsRunningInProxyContext =
          proxyConfig !== undefined &&
          !matchesNoProxy(redirectUrl, proxyConfig.bypass?.split(",") ?? []);
        const validation = await validateUrl(
          redirectUrl,
          redirectIsRunningInProxyContext,
        );

        if (validation.ok) {
          await continuePausedRequest(event.requestId);
          return;
        }

        logger.warn(
          `[Crawler][${jobId}] Blocking redirect to disallowed URL "${redirectUrl}": ${validation.reason}`,
        );
        await failPausedRequest(event.requestId);
      } catch (e) {
        logger.warn(
          `[Crawler][${jobId}] Blocking redirect after redirect guard failed: ${e}`,
        );
        await failPausedRequest(event.requestId);
      }
    });
    await cdpSession.send("Fetch.enable", {
      handleAuthRequests: true,
      patterns: [
        { urlPattern: "*", requestStage: "Request" },
        { urlPattern: "*", requestStage: "Response" },
      ],
    });
  } catch (e) {
    logger.warn(`[Crawler][${jobId}] Failed to install redirect guard: ${e}`);
  }

  return cdpSession;
}
