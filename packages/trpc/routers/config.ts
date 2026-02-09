import { clientConfig } from "@karakeep/shared/config";
import { zClientConfigSchema } from "@karakeep/shared/types/config";

import { publicProcedure, router } from "../index";

export const configAppRouter = router({
  clientConfig: publicProcedure
    .output(zClientConfigSchema)
    .query(() => clientConfig),
});
