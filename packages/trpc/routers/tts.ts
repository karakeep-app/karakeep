import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { bookmarks } from "@karakeep/db/schema";
import {
  assertTtsUrlAllowed,
  TtsProviderConfigService,
  ttsErrorBody,
  ttsFetch,
  TtsUrlNotAllowedError,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { ttsContentType } from "@karakeep/shared/utils/ttsUtils";

import { getNarrationText, narrationChunks } from "../lib/ttsNarration";
import {
  createRateLimitMiddleware,
  createScopedAuthedProcedure,
  router,
} from "../index";

const ttsProcedure = createScopedAuthedProcedure("users");

const PREVIEW_SAMPLE_TEXT =
  "This is a preview of the selected voice for narrating your bookmarks.";

// Any signed-in user can point the server at an arbitrary URL (self-hosted
// TTS servers usually live on a private LAN, so private IPs stay allowed).
// ttsFetch blocks cloud instance-metadata addresses after DNS resolution and
// refuses redirects; this maps its errors onto tRPC errors.
async function fetchTtsServer(url: string, init: RequestInit) {
  try {
    return await ttsFetch(url, init);
  } catch (e) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        e instanceof TtsUrlNotAllowedError
          ? e.message
          : `Failed to reach the TTS server: ${e}`,
    });
  }
}

const zVoiceSchema = z.object({
  id: z.string(),
  targetQuality: z.string().optional(),
});

export const ttsAppRouter = router({
  // Whether the current user has configured a TTS server. Live (DB-backed)
  // rather than part of the static clientConfig snapshot, since it can
  // change at runtime without a redeploy.
  isConfigured: ttsProcedure
    .output(z.object({ isConfigured: z.boolean() }))
    .query(async ({ ctx }) => {
      const config = await TtsProviderConfigService.get(ctx.db, ctx.user.id);
      return { isConfigured: !!config };
    }),
  // Chunk texts in playback order, so the player can highlight the paragraph
  // being read. Same extraction as the worker, so index i == audio chunk i.
  getChunkTexts: ttsProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.object({ chunks: z.array(z.string()), truncated: z.boolean() }))
    .query(async ({ input, ctx }) => {
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, input.bookmarkId),
        columns: { userId: true },
      });
      if (!bookmark || bookmark.userId !== ctx.user.id) {
        // ponytail: owner only; shared-bookmark viewers get no highlight.
        return { chunks: [], truncated: false };
      }
      const text = await getNarrationText(
        ctx.db,
        input.bookmarkId,
        ctx.user.id,
      );
      return text ? narrationChunks(text) : { chunks: [], truncated: false };
    }),
  getSettings: ttsProcedure
    .output(
      z
        .object({
          provider: z.literal("openai-compatible"),
          baseUrl: z.string(),
          model: z.string(),
          voice: z.string(),
          hasApiKey: z.boolean(),
        })
        .nullable(),
    )
    .query(async ({ ctx }) => {
      const config = await TtsProviderConfigService.get(ctx.db, ctx.user.id);
      if (!config) {
        return null;
      }
      return {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        voice: config.voice,
        hasApiKey: !!config.apiKey,
      };
    }),
  updateSettings: ttsProcedure
    .input(
      z.object({
        provider: z.literal("openai-compatible"),
        baseUrl: z.string().url(),
        // Empty/omitted keeps the currently stored key, if any.
        apiKey: z.string().optional(),
        model: z.string().min(1),
        voice: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // The worker fetches this URL unattended on every future TTS job, so
      // reject metadata endpoints at save time too. DNS failures are let
      // through: the worker re-checks on every request anyway.
      try {
        await assertTtsUrlAllowed(input.baseUrl);
      } catch (e) {
        if (e instanceof TtsUrlNotAllowedError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
      }
      await TtsProviderConfigService.set(ctx.db, ctx.user.id, input);
    }),
  discoverVoices: ttsProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
      }),
    )
    .output(z.object({ voices: z.array(zVoiceSchema) }))
    .mutation(async ({ input, ctx }) => {
      // getSettings never echoes the stored key back to the client, so the
      // form field is empty on every load. Without this fallback,
      // discovering voices against an already-configured, auth-required
      // server would 401 forever after the first save.
      let apiKey = input.apiKey;
      if (!apiKey) {
        const existing = await TtsProviderConfigService.get(
          ctx.db,
          ctx.user.id,
        );
        apiKey = existing?.apiKey ?? undefined;
      }
      const response = await fetchTtsServer(`${input.baseUrl}/audio/voices`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `TTS server returned ${response.status}`,
        });
      }
      const data: unknown = await response.json();
      const rawVoices = Array.isArray(data)
        ? data
        : ((data as { voices?: unknown[] })?.voices ?? []);
      const voices = rawVoices
        .map((v) => {
          if (typeof v === "string") {
            return { id: v };
          }
          const obj = v as {
            voice_id?: string;
            id?: string;
            name?: string;
            target_quality?: string;
          };
          const id = obj?.voice_id ?? obj?.id ?? obj?.name;
          if (typeof id !== "string") {
            return null;
          }
          return {
            id,
            targetQuality:
              typeof obj?.target_quality === "string"
                ? obj.target_quality
                : undefined,
          };
        })
        .filter((v): v is z.infer<typeof zVoiceSchema> => v !== null);

      // Sort by target_quality (descending) when the server reports it;
      // otherwise preserve the server's own ordering.
      if (voices.some((v) => v.targetQuality !== undefined)) {
        voices.sort((a, b) => {
          const aq = a.targetQuality;
          const bq = b.targetQuality;
          if (aq === bq) return 0;
          if (aq === undefined) return 1;
          if (bq === undefined) return -1;
          // Single-letter school-style grades (Kokoro's convention: A is the
          // best quality, unlike a numeric score where higher is better), so
          // these sort ascending rather than descending.
          const isLetterGrade = (v: string) => /^[A-Za-z]$/.test(v);
          if (isLetterGrade(aq) && isLetterGrade(bq)) {
            return aq.localeCompare(bq);
          }
          const aNum = Number(aq);
          const bNum = Number(bq);
          if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            return bNum - aNum;
          }
          return bq.localeCompare(aq);
        });
      }

      return { voices };
    }),
  discoverModels: ttsProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
      }),
    )
    .output(z.object({ models: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      let apiKey = input.apiKey;
      if (!apiKey) {
        const existing = await TtsProviderConfigService.get(
          ctx.db,
          ctx.user.id,
        );
        apiKey = existing?.apiKey ?? undefined;
      }
      const response = await fetchTtsServer(`${input.baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `TTS server returned ${response.status}`,
        });
      }
      const data: unknown = await response.json();
      const rawModels = Array.isArray(data)
        ? data
        : ((data as { data?: unknown[] })?.data ?? []);
      const models = rawModels
        .map((m) =>
          typeof m === "string" ? m : ((m as { id?: string })?.id ?? null),
        )
        .filter((m): m is string => typeof m === "string");
      return { models };
    }),
  // Synthesizes a short fixed phrase so the user can hear a voice before
  // saving it. Runs through the server (rather than the browser calling the
  // TTS server directly) so the API key never has to leave the backend.
  previewVoice: ttsProcedure
    .use(
      createRateLimitMiddleware({
        name: "tts.previewVoice",
        windowMs: 60 * 1000,
        maxRequests: 10,
      }),
    )
    .input(
      z.object({
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
        model: z.string().min(1),
        voice: z.string().min(1),
      }),
    )
    .output(z.object({ audio: z.string(), contentType: z.string() }))
    .mutation(async ({ input, ctx }) => {
      let apiKey = input.apiKey;
      if (!apiKey) {
        const existing = await TtsProviderConfigService.get(
          ctx.db,
          ctx.user.id,
        );
        apiKey = existing?.apiKey ?? undefined;
      }
      const response = await fetchTtsServer(`${input.baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: input.model,
          input: PREVIEW_SAMPLE_TEXT,
          voice: input.voice,
          response_format: serverConfig.tts.responseFormat,
        }),
        signal: AbortSignal.timeout(serverConfig.tts.timeoutSec * 1000),
      });
      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `TTS server returned ${response.status}: ${await ttsErrorBody(response)}`,
        });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        audio: buffer.toString("base64"),
        contentType: ttsContentType(serverConfig.tts.responseFormat),
      };
    }),
});
