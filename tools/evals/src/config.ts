import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  EVAL_TEXT_MODEL: z.string().default("gpt-4.1-mini"),
  EVAL_JUDGE_MODEL: z.string().default("gpt-4.1-mini"),
  EVAL_CONTEXT_LENGTH: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 8000)),
  EVAL_MAX_OUTPUT_TOKENS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 2048)),
});

export const config = envSchema.parse(process.env);
