import { z } from "zod";

const rawConfig = z
  .object({
    MEILI_ADDR: z.string().optional(),
    MEILI_MASTER_KEY: z.string().optional(),
    // Dedicated Meilisearch instance for the vector store. When unset, the
    // vector store falls back to the main (search) Meilisearch instance.
    MEILI_VECTOR_ADDR: z.string().optional(),
    MEILI_VECTOR_MASTER_KEY: z.string().optional(),
    MEILI_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    MEILI_BATCH_TIMEOUT_MS: z.coerce.number().int().positive().default(500),
  })
  .parse(process.env);

export const envConfig = {
  MEILI_ADDR: rawConfig.MEILI_VECTOR_ADDR ?? rawConfig.MEILI_ADDR,
  MEILI_MASTER_KEY:
    rawConfig.MEILI_VECTOR_MASTER_KEY ?? rawConfig.MEILI_MASTER_KEY ?? "",
  MEILI_BATCH_SIZE: rawConfig.MEILI_BATCH_SIZE,
  MEILI_BATCH_TIMEOUT_MS: rawConfig.MEILI_BATCH_TIMEOUT_MS,
};
