import type { APIRoute } from "astro";

import { renderPricingMarkdown } from "../pricing-markdown";

export const GET = (() => {
  return new Response(renderPricingMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}) satisfies APIRoute;
