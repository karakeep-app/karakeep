import { z } from "zod";

import {
  zReaderViewReasonSchema,
  zReaderViewStatusSchema,
} from "@karakeep/shared/types/bookmarks";

export const parseSubprocessInputSchema = z.object({
  htmlContent: z.string(),
  url: z.string(),
  jobId: z.string(),
  // When true, only run metadata extraction and skip the (expensive)
  // readable-content extraction. `readableContent` will be null.
  metadataOnly: z.boolean().optional(),
});

export const parseSubprocessMetadataSchema = z.looseObject({
  title: z.string().nullish(),
  description: z.string().nullish(),
  image: z.string().nullish(),
  logo: z.string().nullish(),
  author: z.string().nullish(),
  publisher: z.string().nullish(),
  datePublished: z.string().nullish(),
  dateModified: z.string().nullish(),
});

export const parseSubprocessOutputSchema = z.object({
  metadata: parseSubprocessMetadataSchema,
  readableContent: z.object({ content: z.string() }).nullable(),
  readerViewAssessment: z
    .object({
      status: zReaderViewStatusSchema,
      score: z.number().int().min(0).max(100),
      reasons: z.array(zReaderViewReasonSchema),
      classifierVersion: z.number().int().positive(),
    })
    .nullable(),
});

export const parseSubprocessErrorSchema = z.object({
  error: z.string(),
  stack: z.string().optional(),
});

export type ParseSubprocessInput = z.infer<typeof parseSubprocessInputSchema>;
export type ParseSubprocessOutput = z.infer<typeof parseSubprocessOutputSchema>;
export type ParseSubprocessError = z.infer<typeof parseSubprocessErrorSchema>;
