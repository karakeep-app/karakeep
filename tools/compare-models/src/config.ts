import { z } from "zod";

// Local config schema for compare-models tool
const envSchema = z.object({
  KARAKEEP_API_KEY: z.string().min(1),
  KARAKEEP_SERVER_ADDR: z.string().url(),
  MODEL1_NAME: z.string().min(1),
  MODEL2_NAME: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  COMPARISON_MODE: z
    .enum(["model-vs-model", "model-vs-existing"])
    .default("model-vs-model"),
  COMPARE_LIMIT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  INFERENCE_CONTEXT_LENGTH: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 8000)),
  INFERENCE_MAX_OUTPUT_TOKENS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 2048)),
  INFERENCE_USE_MAX_COMPLETION_TOKENS: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default("false"),
});

export const config = envSchema.parse(process.env);
