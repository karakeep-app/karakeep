import { z } from "zod";

export const envConfig = z
  .object({
    REDIS_URL: z.string().optional(),
  })
  .parse(process.env);
