import type { z } from "zod";

/**
 * Zod's default messages read like type errors ("Too small: expected string to
 * have >=8 characters"). The shared schemas stay as they are for the API, and
 * auth forms pass this to `zodResolver` to get messages meant for people.
 */
export const humanAuthErrors: { error: z.core.$ZodErrorMap } = {
  error: (issue) => {
    switch (issue.code) {
      case "too_small":
        return issue.origin === "string"
          ? `Use at least ${issue.minimum as number} characters`
          : undefined;
      case "too_big":
        return issue.origin === "string"
          ? `Use at most ${issue.maximum as number} characters`
          : undefined;
      case "invalid_format":
        if (issue.format !== "email") {
          return undefined;
        }
        return issue.input === ""
          ? "Enter your email address"
          : "Enter a valid email address";
      case "invalid_type":
        return "This field is required";
      default:
        return undefined;
    }
  },
};
