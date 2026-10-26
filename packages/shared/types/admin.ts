import { z } from "zod";

import { PASSWORD_MAX_LENGTH, zSignUpSchema } from "./users";

export const zRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export const zAdminCreateUserSchema = zSignUpSchema.safeExtend(
  zRoleSchema.shape,
);

export const zAdminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["user", "admin"]).nullable(),
  bookmarkQuota: z.number().nullable(),
  storageQuota: z.number().nullable(),
});

export const zAdminGetUserSchema = z.union([
  z.object({ id: z.string() }),
  z.object({ email: z.string().trim().toLowerCase().email() }),
]);

export const updateUserSchema = z.object({
  userId: z.string(),
  role: z.enum(["user", "admin"]).optional(),
  bookmarkQuota: z.number().int().min(0).nullable().optional(),
  storageQuota: z.number().int().min(0).nullable().optional(),
  browserCrawlingEnabled: z.boolean().nullable().optional(),
});

export const zAdminJobModifiedWithinSecondsSchema = z
  .number()
  .int()
  .positive()
  .describe(
    "Only process bookmarks modified within this many seconds. Omit to process all matching bookmarks.",
  );

export const resetPasswordSchema = z
  .object({
    userId: z.string(),
    newPassword: z.string().min(8).max(PASSWORD_MAX_LENGTH),
    newPasswordConfirm: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirm, {
    message: "Passwords don't match",
    path: ["newPasswordConfirm"],
  });
