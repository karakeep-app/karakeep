import { z } from "zod";

export const PROBLEM_REPORT_CATEGORIES = [
  "bug",
  "content",
  "performance",
  "account",
  "other",
] as const;

export const zProblemReportCategorySchema = z.enum(PROBLEM_REPORT_CATEGORIES);
export type ZProblemReportCategory = z.infer<
  typeof zProblemReportCategorySchema
>;

export const MAX_PROBLEM_REPORT_RECENT_ERRORS = 20;

export const zProblemReportRecentErrorSchema = z.object({
  message: z.string().max(2000),
  source: z.string().max(500).optional(),
  timestamp: z.string().max(64),
});
export type ZProblemReportRecentError = z.infer<
  typeof zProblemReportRecentErrorSchema
>;

// Diagnostics collected by the client. Everything here is optional and
// size-bounded since it's user controlled.
export const zProblemReportClientDiagnosticsSchema = z.object({
  pageUrl: z.string().max(2000).optional(),
  userAgent: z.string().max(1000).optional(),
  language: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
  viewport: z.string().max(50).optional(),
  screen: z.string().max(50).optional(),
  devicePixelRatio: z.number().optional(),
  theme: z.string().max(50).optional(),
  online: z.boolean().optional(),
  clientTimestamp: z.string().max(64).optional(),
  recentErrors: z
    .array(zProblemReportRecentErrorSchema)
    .max(MAX_PROBLEM_REPORT_RECENT_ERRORS)
    .optional(),
});
export type ZProblemReportClientDiagnostics = z.infer<
  typeof zProblemReportClientDiagnosticsSchema
>;

export const zSubmitProblemReportSchema = z.object({
  category: zProblemReportCategorySchema,
  description: z.string().trim().min(10).max(5000),
  diagnostics: zProblemReportClientDiagnosticsSchema.optional(),
});
export type ZSubmitProblemReport = z.infer<typeof zSubmitProblemReportSchema>;
