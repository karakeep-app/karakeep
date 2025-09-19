import { z } from "zod";

import { PASSWORD_MAX_LENGTH, zSignUpSchema } from "./users";

export const zRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export const zAdminCreateUserSchema = zSignUpSchema.and(zRoleSchema);

export const updateUserSchema = z.object({
  userId: z.string(),
  role: z.enum(["user", "admin"]).optional(),
  bookmarkQuota: z.number().int().min(0).nullable().optional(),
  storageQuota: z.number().int().min(0).nullable().optional(),
  browserCrawlingEnabled: z.boolean().nullable().optional(),
});

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
