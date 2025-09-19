import { z } from "zod";

export const zUploadErrorSchema = z.object({
  error: z.string(),
});

export type ZUploadError = z.infer<typeof zUploadErrorSchema>;

export const zUploadResponseSchema = z.object({
  assetId: z.string(),
  contentType: z.string(),
  size: z.number(),
  fileName: z.string(),
});

export type ZUploadResponse = z.infer<typeof zUploadResponseSchema>;
