import { z } from "zod";

export const envConfig = z
  .object({
    RESTATE_LISTEN_PORT: z.coerce.number().optional(),
    RESTATE_INGRESS_ADDR: z
      .string()
      .optional()
      .default("http://localhost:8080"),
  })
  .parse(process.env);
