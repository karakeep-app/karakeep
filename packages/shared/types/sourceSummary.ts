import { z } from "zod";

export const zSummaryErrorCode = z.enum([
  "source_changed",
  "no_text",
  "timeout",
  "auth",
  "quota",
  "provider",
  "cancelled",
  "too_large",
]);
export type SummaryErrorCode = z.infer<typeof zSummaryErrorCode>;
export const zSummaryStage = z.enum([
  "queued",
  "notebooklm",
  "hermes",
  "retry_wait",
  "success",
  "failure",
]);

export const zSummaryProcessingStatus = z.object({
  enabled: z.boolean(),
  processing: z
    .object({
      status: z.enum(["pending", "success", "failure"]),
      stage: zSummaryStage,
      provider: z.enum(["notebooklm", "hermes"]).nullable(),
      errorCode: zSummaryErrorCode.nullable(),
      notebookErrorCode: zSummaryErrorCode.nullable(),
      hermesErrorCode: zSummaryErrorCode.nullable(),
      retryCount: z.number().int().nonnegative(),
      nextRetryAt: z.date().nullable(),
      startedAt: z.date().nullable(),
      generatedAt: z.date().nullable(),
      taggingStatus: z.enum(["pending", "success", "failure"]).nullable(),
      taggingErrorCode: z
        .enum([...zSummaryErrorCode.options, "invalid_response"])
        .nullable(),
    })
    .nullable(),
});
export type SummaryProcessingStatus = z.infer<typeof zSummaryProcessingStatus>;
