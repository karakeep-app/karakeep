import { z } from "zod";

export const parseSubprocessInputSchema = z.object({
  htmlContent: z.string(),
  url: z.string(),
  jobId: z.string(),
});

export const parseSubprocessMetadataSchema = z
  .object({
    title: z.string().nullish(),
    description: z.string().nullish(),
    image: z.string().nullish(),
    logo: z.string().nullish(),
    author: z.string().nullish(),
    publisher: z.string().nullish(),
    datePublished: z.string().nullish(),
    dateModified: z.string().nullish(),
  })
  .passthrough();

export const parseSubprocessOutputSchema = z.object({
  metadata: parseSubprocessMetadataSchema,
  readableContent: z.object({ content: z.string() }).nullable(),
  contentQuality: z.enum(["good", "poor"]),
});

export const parseSubprocessErrorSchema = z.object({
  error: z.string(),
  stack: z.string().optional(),
});

export type ParseSubprocessInput = z.infer<typeof parseSubprocessInputSchema>;
export type ParseSubprocessOutput = z.infer<typeof parseSubprocessOutputSchema>;
export type ParseSubprocessError = z.infer<typeof parseSubprocessErrorSchema>;
