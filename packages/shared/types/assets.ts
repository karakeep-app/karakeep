import { z } from "zod";

export const zAssetSignedTokenSchema = z.object({
  assetId: z.string(),
  userId: z.string(),
});
