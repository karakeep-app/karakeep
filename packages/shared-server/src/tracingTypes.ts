export type TracingAttributeKey =
  // User attributes
  | "user.id"
  | "user.role"
  | "user.tier"
  // RPC attributes
  | "rpc.system"
  | "rpc.method"
  | "rpc.type"
  // Job attributes
  | "job.id"
  | "job.priority"
  | "job.runNumber"
  | "job.groupId"
  // Bookmark attributes
  | "bookmark.id"
  | "bookmark.url"
  | "bookmark.domain"
  | "bookmark.content.size"
  | "bookmark.content.type"
  // Asset attributes
  | "asset.id"
  | "asset.type"
  | "asset.size"
  // Crawler-specific attributes
  | "crawler.forceStorePdf"
  | "crawler.archiveFullPage"
  | "crawler.hasPrecrawledArchive"
  | "crawler.getContentType.statusCode"
  | "crawler.contentType"
  | "crawler.statusCode"
  | "crawler.cleanup.hasPage"
  | "crawler.cleanup.pageClosed"
  | "crawler.cleanup.contextClosed"
  // Database attributes
  | "db.system"
  | "db.statement"
  | "db.operation"
  // Inference-specific attributes
  | "inference.tagging.numGeneratedTags"
  | "inference.tagging.style"
  | "inference.summary.size"
  | "inference.lang"
  | "inference.prompt.size"
  | "inference.prompt.customCount"
  | "inference.totalTokens"
  | "inference.model"
  | "inference.type";

export type TracingAttributes = Partial<
  Record<TracingAttributeKey, string | number | boolean>
>;
