import { z } from "zod";

export const envConfig = z
  .object({
    RESTATE_LISTEN_PORT: z.coerce.number().optional(),
    RESTATE_INGRESS_ADDR: z
      .string()
      .optional()
      .default("http://localhost:8080"),
    RESTATE_ADMIN_ADDR: z.string().optional().default("http://localhost:9070"),
    RESTATE_PUB_KEY: z.string().optional(),
  })
  .parse(process.env);
