import { z } from "zod";

export const zClientConfigSchema = z.object({
  publicUrl: z.string(),
  publicApiUrl: z.string(),
  demoMode: z
    .object({
      email: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  auth: z.object({
    disableSignups: z.boolean(),
    disablePasswordAuth: z.boolean(),
  }),
  turnstile: z
    .object({
      siteKey: z.string(),
    })
    .nullable(),
  inference: z.object({
    isConfigured: z.boolean(),
    inferredTagLang: z.string(),
    enableAutoTagging: z.boolean(),
    enableAutoSummarization: z.boolean(),
  }),
  legal: z.object({
    termsOfServiceUrl: z.string().optional(),
    privacyPolicyUrl: z.string().optional(),
  }),
  serverVersion: z.string().optional(),
  disableNewReleaseCheck: z.boolean(),
});
