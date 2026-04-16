import * as z from "zod";

export const ErrorSchema = z
  .object({
    code: z.string().describe("A machine-readable error code."),
    message: z.string().describe("A human-readable error message."),
  })
  .openapi("Error");

export const UnauthorizedResponse = {
  description:
    "Unauthorized — the Bearer token is missing, invalid, or expired.",
  content: {
    "text/plain": {
      schema: z.string().openapi({
        example: "Unauthorized",
      }),
    },
  },
} as const;
