import { z } from "zod";

export const envConfig = z
  .object({
    SUPPORT_EMAIL: z.string().email().optional(),
  })
  .parse(process.env);
