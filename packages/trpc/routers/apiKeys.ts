import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { apiKeys } from "@karakeep/db/schema";
import { addLogFields, logEvent } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import {
  API_KEY_FULL_ACCESS_SCOPE,
  zApiKeyScopesSchema,
} from "@karakeep/shared/types/apiKeys";

import {
  authenticateApiKey,
  generateApiKey,
  regenerateApiKey,
  validatePassword,
} from "../auth";
import {
  createEventLogMiddleware,
  createRateLimitMiddleware,
  publicProcedure,
  router,
  sessionProcedure,
} from "../index";

const zApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  createdAt: z.date(),
  scopes: zApiKeyScopesSchema,
});

export const apiKeysAppRouter = router({
  create: sessionProcedure
    .use(createEventLogMiddleware("apiKey.create"))
    .input(
      z.object({
        name: z.string(),
        scopes: zApiKeyScopesSchema.optional(),
      }),
    )
    .output(zApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      // Omitted scopes preserve the existing API behavior: a new key gets
      // explicit full access unless the caller asks for granular scopes.
      const scopes = input.scopes ?? [API_KEY_FULL_ACCESS_SCOPE];
      const created = await generateApiKey(
        input.name,
        ctx.user.id,
        ctx.db,
        scopes,
      );
      addLogFields<"apiKey.create">({
        "apiKey.id": created.id,
        "apiKey.source": "session",
      });
      return created;
    }),
  regenerate: sessionProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(zApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      // Find the existing API key to get its name
      const existingKey = await ctx.db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)),
      });

      if (!existingKey) {
        throw new TRPCError({
          message: "API key not found",
          code: "NOT_FOUND",
        });
      }

      return {
        id: existingKey.id,
        name: existingKey.name,
        createdAt: existingKey.createdAt,
        scopes: existingKey.scopes,
        key: await regenerateApiKey(existingKey.id, ctx.user.id, ctx.db),
      };
    }),
  revoke: sessionProcedure
    .use(createEventLogMiddleware("apiKey.revoke"))
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      addLogFields<"apiKey.revoke">({ "apiKey.id": input.id });
      await ctx.db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)));
    }),
  list: sessionProcedure
    .output(
      z.object({
        keys: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            createdAt: z.date(),
            keyId: z.string(),
            lastUsedAt: z.date().nullish(),
            scopes: zApiKeyScopesSchema,
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const resp = await ctx.db.query.apiKeys.findMany({
        where: eq(apiKeys.userId, ctx.user.id),
        columns: {
          id: true,
          name: true,
          createdAt: true,
          lastUsedAt: true,
          keyId: true,
          scopes: true,
        },
        orderBy: desc(apiKeys.createdAt),
      });
      return { keys: resp };
    }),
  // Exchange the username and password with an API key.
  // Homemade oAuth. This is used by the extension.
  exchange: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "apiKey.exchange",
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
      }),
    ) // 10 requests per 15 minutes
    .use(createEventLogMiddleware("apiKey.create"))
    .input(
      z.object({
        keyName: z.string(),
        email: z.string(),
        password: z.string(),
        scopes: zApiKeyScopesSchema.optional(),
      }),
    )
    .output(zApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      addLogFields<"apiKey.create">({ "apiKey.source": "exchange" });
      let user;
      // Special handling as otherwise the extension would show "username or password is wrong"
      if (serverConfig.auth.disablePasswordAuth) {
        throw new TRPCError({
          message: "Password authentication is currently disabled",
          code: "FORBIDDEN",
        });
      }
      try {
        user = await validatePassword(input.email, input.password, ctx.db);
      } catch {
        logEvent({
          "event.name": "user.login_failed",
          "user.email": input.email,
          "auth.failure_reason": "invalid_credentials",
        });
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      addLogFields({ "user.id": user.id });

      // Check if email verification is required and if the user has verified their email
      if (serverConfig.auth.emailVerificationRequired && !user.emailVerified) {
        throw new TRPCError({
          message:
            "Please verify your email address before generating an API key",
          code: "FORBIDDEN",
        });
      }

      // Omitted scopes preserve the existing API behavior: a new key gets
      // explicit full access unless the caller asks for granular scopes.
      const scopes = input.scopes ?? [API_KEY_FULL_ACCESS_SCOPE];
      const created = await generateApiKey(
        input.keyName,
        user.id,
        ctx.db,
        scopes,
      );
      addLogFields<"apiKey.create">({ "apiKey.id": created.id });
      return created;
    }),
  validate: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "apiKey.validate",
        windowMs: 60 * 1000,
        maxRequests: 30,
      }),
    ) // 30 requests per minute
    .input(z.object({ apiKey: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await authenticateApiKey(input.apiKey, ctx.db); // Throws if the key is invalid
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      return {
        success: true,
      };
    }),
});
