import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { zSubmitProblemReportSchema } from "@karakeep/shared/types/problemReports";

import { sendProblemReportEmail } from "../email";
import { createRateLimitMiddleware, router, sessionProcedure } from "../index";

export const problemReportsAppRouter = router({
  submit: sessionProcedure
    .use(
      createRateLimitMiddleware({
        name: "problemReports.submit",
        windowMs: 60 * 60 * 1000,
        maxRequests: 5,
      }),
    )
    .input(zSubmitProblemReportSchema)
    .output(z.object({ reportId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!serverConfig.problemReports.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Problem reports are not enabled on this server",
        });
      }

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
