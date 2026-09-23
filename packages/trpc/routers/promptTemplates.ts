import { z } from "zod";

import { getExternalPromptTemplates } from "@karakeep/shared/prompts.external";

import { authedProcedure, router } from "../index";

/**
 * Exposes the instance-wide external prompt template overrides (files in
 * PROMPTS_DIR) so the web UI's prompt preview can render the prompts that
 * are actually sent to the AI. Null means no override file exists and the
 * built-in prompt is used.
 */
export const promptTemplatesAppRouter = router({
  list: authedProcedure
    .output(
      z.object({
        textTagging: z.string().nullable(),
        imageTagging: z.string().nullable(),
        summary: z.string().nullable(),
        ocr: z.string().nullable(),
      }),
    )
    .query(() => getExternalPromptTemplates()),
});
