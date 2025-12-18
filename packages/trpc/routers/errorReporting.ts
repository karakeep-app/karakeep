import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { authedProcedure, createRateLimitMiddleware, router } from "../index";
import { User } from "../models/users";

export const errorReportingAppRouter = router({
  reportProblem: authedProcedure
    .use(
      createRateLimitMiddleware({
        name: "errorReporting.reportProblem",
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
      }),
    )
    .input(
      z.object({
        message: z.string().min(1).max(5000),
        debugInfo: z
          .object({
            userAgent: z.string().optional(),
            url: z.string().optional(),
            timestamp: z.string().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const errorReportClient = await PluginManager.getClient(
        PluginType.ErrorReport,
      );

      if (!errorReportClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error reporting is not configured",
        });
      }

      const user = await User.fromCtx(ctx);

      await errorReportClient.reportProblem({
        userId: user.user.id,
        userName: user.user.name,
        userEmail: user.user.email,
        message: input.message,
        debugInfo: input.debugInfo,
      });

      return { success: true };
    }),
});
