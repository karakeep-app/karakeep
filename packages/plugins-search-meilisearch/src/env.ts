import { z } from "zod";

export const envConfig = z
  .object({
    MEILI_ADDR: z.string().optional(),
    MEILI_MASTER_KEY: z.string().default(""),
  })
  .parse(process.env);
