import type { Config } from "tailwindcss";
import { hairlineWidth } from "nativewind/theme";

import base from "./base";

export default {
  content: base.content,
  presets: [base],
  theme: {
    extend: {
      borderWidth: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        hairline: hairlineWidth(),
      },
    },
  },
} satisfies Config;
