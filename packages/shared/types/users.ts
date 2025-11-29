import { z } from "zod";

import { zBookmarkSourceSchema } from "./bookmarks";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

export const zSignUpSchema = z
  .object({
    name: z.string().min(1, { message: "Name can't be empty" }),
    email: z.string().email(),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const zResetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export const zChangePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(PASSWORD_MAX_LENGTH),
    newPasswordConfirm: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirm, {
    message: "Passwords don't match",
    path: ["newPasswordConfirm"],
  });

export const zWhoAmIResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  localUser: z.boolean(),
});

export const zUserStatsResponseSchema = z.object({
  numBookmarks: z.number(),
  numFavorites: z.number(),
  numArchived: z.number(),
  numTags: z.number(),
  numLists: z.number(),
  numHighlights: z.number(),
  bookmarksByType: z.object({
    link: z.number(),
    text: z.number(),
    asset: z.number(),
  }),
  topDomains: z
    .array(
      z.object({
        domain: z.string(),
        count: z.number(),
      }),
    )
    .max(10),
  totalAssetSize: z.number(),
  assetsByType: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
      totalSize: z.number(),
    }),
  ),
  bookmarkingActivity: z.object({
    thisWeek: z.number(),
    thisMonth: z.number(),
    thisYear: z.number(),
    byHour: z.array(
      z.object({
        hour: z.number(),
        count: z.number(),
      }),
    ),
    byDayOfWeek: z.array(
      z.object({
        day: z.number(),
        count: z.number(),
      }),
    ),
  }),
  tagUsage: z
    .array(
      z.object({
        name: z.string(),
        count: z.number(),
      }),
    )
    .max(10),
  bookmarksBySource: z.array(
    z.object({
      source: zBookmarkSourceSchema.nullable(),
      count: z.number(),
    }),
  ),
});

export const zUserSettingsSchema = z.object({
  bookmarkClickAction: z.enum([
    "open_original_link",
    "expand_bookmark_preview",
  ]),
  archiveDisplayBehaviour: z.enum(["show", "hide"]),
  timezone: z.string(),
  backupsEnabled: z.boolean(),
  backupsFrequency: z.enum(["daily", "weekly"]),
  backupsRetentionDays: z.number().int().min(1).max(365),
});

export type ZUserSettings = z.infer<typeof zUserSettingsSchema>;

export const zUpdateUserSettingsSchema = zUserSettingsSchema.partial().pick({
  bookmarkClickAction: true,
  archiveDisplayBehaviour: true,
  timezone: true,
  backupsEnabled: true,
  backupsFrequency: true,
  backupsRetentionDays: true,
});

export const zUpdateBackupSettingsSchema = zUpdateUserSettingsSchema.pick({
  backupsEnabled: true,
  backupsFrequency: true,
  backupsRetentionDays: true,
});
