import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

const TurnstileVerifyResponseSchema = z.object({
  success: z.boolean(),
  challenge_ts: z.string().optional(),
  hostname: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
) {
  if (!serverConfig.auth.turnstile.enabled) {
    return { success: true };
  }

  if (!token) {
    return { success: false, "error-codes": ["missing-input-response"] };
  }

  const body = new URLSearchParams();
  body.append("secret", serverConfig.auth.turnstile.secretKey!);
  body.append("response", token);
  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
      },
    );

    if (!response.ok) {
      logger.warn(
        `[Turnstile] Verification request failed with status ${response.status}`,
      );
      return { success: false, "error-codes": ["request-not-ok"] };
    }

    const json = await response.json();
    const parseResult = TurnstileVerifyResponseSchema.safeParse(json);

    if (!parseResult.success) {
      logger.warn("[Turnstile] Invalid response format", {
        error: parseResult.error,
        remoteIp,
      });
      return { success: false, "error-codes": ["invalid-response"] };
    }

    const parsed = parseResult.data;
    if (!parsed.success) {
      logger.warn("[Turnstile] Verification failed", {
        errorCodes: parsed["error-codes"],
        remoteIp,
      });
    }
    return parsed;
  } catch (error) {
    logger.warn("[Turnstile] Verification threw", { error, remoteIp });
    return { success: false, "error-codes": ["internal-error"] };
  }
}
