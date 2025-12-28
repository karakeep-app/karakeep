import { z } from "zod";

const envSchema = z.object({
  KARAKEEP_API_KEY: z.string().min(1),
  KARAKEEP_SERVER_ADDR: z.string().url(),
  MODEL1_NAME: z.string().min(1),
  MODEL2_NAME: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  COMPARE_LIMIT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
});

export const config = envSchema.parse(process.env);
