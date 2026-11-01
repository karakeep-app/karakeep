import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { RateLimitConfig } from "@karakeep/shared/ratelimiting";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";
import { zSubmitProblemReportSchema } from "@karakeep/shared/types/problemReports";

import { sendProblemReportEmail } from "../email";
import { router, sessionProcedure } from "../index";

const PROBLEM_REPORTS_RATE_LIMIT: RateLimitConfig = {
  name: "problemReports.submit",
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
};

// Every report sends an email to the administrator, so unlike the generic
// rate limits, this one is enforced even when RATE_LIMITING_ENABLED is off.
async function enforceProblemReportRateLimit(userId: string) {
  const client = await getRateLimitClient();
  if (!client) {
    return;
  }
  const result = await client.checkRateLimit(
    PROBLEM_REPORTS_RATE_LIMIT,
    `problemReports:user:${userId}`,
  );
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You've sent too many reports. Try again in ${Math.ceil(result.resetInSeconds / 60)} minutes.`,
    });
  }
}

export const problemReportsAppRouter = router({
  submit: sessionProcedure
    .input(zSubmitProblemReportSchema)
    .output(z.object({ reportId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!serverConfig.problemReports.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Problem reports are not enabled on this server",
        });
      }

      await enforceProblemReportRateLimit(ctx.user.id);

      const reportId = randomUUID();
      // Logged so the report can be correlated with server logs around the
      // same time.
      logger.info(
        `[problemReports] Received report ${reportId} (category: ${input.category}) from user ${ctx.user.id}`,
      );

      try {
        await sendProblemReportEmail({
          reportId,
          category: input.category,
          description: input.description,
          reporter: {
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
            role: ctx.user.role,
          },
          server: {
            version: serverConfig.serverVersion,
            publicUrl: serverConfig.publicUrl,
            receivedAt: new Date().toISOString(),
          },
          diagnostics: input.diagnostics,
        });
      } catch (e) {
        logger.error(
          `[problemReports] Failed to send report ${reportId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send the problem report. Please try again later.",
        });
      }

      return { reportId };
    }),
});
