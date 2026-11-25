import { z } from "zod";

export const parsePdfSubprocessInputSchema = z.object({
  // Path to a temp file containing the PDF. The parent process owns this file
  // and deletes it once the subprocess exits.
  pdfPath: z.string(),
  // Path the subprocess writes its result to. A file is used instead of stdout
  // so nothing the PDF library logs can corrupt the result.
  outputPath: z.string(),
});

export const parsePdfSubprocessOutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    text: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export type ParsePdfSubprocessInput = z.infer<
  typeof parsePdfSubprocessInputSchema
>;
export type ParsePdfSubprocessOutput = z.infer<
  typeof parsePdfSubprocessOutputSchema
>;
