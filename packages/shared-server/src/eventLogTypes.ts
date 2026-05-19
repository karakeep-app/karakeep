type EventLogInternal =
  // Worker Events
  | {
      ["event.name"]: "crawlerWorker.run";
      "crawler.url"?: string;
      "crawler.domain"?: string;
      "crawler.status_code"?: number | null;
      "crawler.proxy"?: string;
    }
  | {
      ["event.name"]: "inferenceWorker.run";
      "bookmark.id": string;
      "inference.type": "tag" | "summarize";
      "inference.model"?: string;
      "inference.total_tokens"?: number;
      "bookmark.url"?: string;
      "bookmark.domain"?: string;
      "bookmark.content_type"?: string;
      "crawler.status_code"?: number | null;
      "inference.prompt.custom_count"?: number;
      "inference.prompt.size"?: number;
      "inference.summary.size"?: number;
      "inference.tagging.style"?: string;
      "inference.tagging.lang"?: string;
      "inference.tagging.num_generated_tags"?: number;
    }
  | {
      ["event.name"]: "bookmark.summarize";
      "bookmark.id"?: string;
      "inference.model"?: string;
      "inference.total_tokens"?: number;
      "inference.prompt.custom_count"?: number;
      "inference.prompt.size"?: number;
      "inference.summary.size"?: number;
    }
  | {
      ["event.name"]: "feedWorker.run";
      "feed.id"?: string;
      "feed.url"?: string;
      "feed.status_code"?: number;
      "feed.items_found"?: number;
      "feed.items_new"?: number;
      "feed.skipped_quota"?: boolean;
    }
  | {
      ["event.name"]: "assetPreprocessingWorker.run";
      "bookmark.id"?: string;
      "asset.type"?: string;
      "asset.size"?: number;
      "asset.content_type"?: string;
      "preprocessing.fix_mode"?: boolean;
      "preprocessing.changed"?: boolean;
    }
  | {
      ["event.name"]: "videoWorker.run";
      "bookmark.id"?: string;
    }
  | {
      ["event.name"]: "webhookWorker.run";
      "bookmark.id"?: string;
      "webhook.operation"?: string;
      "webhook.matching_count"?: number;
      "webhook.delivered_count"?: number;
      "webhook.failed_count"?: number;
    }
  | {
      ["event.name"]: "ruleEngineWorker.run";
      "bookmark.id"?: string;
      "rule_engine.events_count"?: number;
      "rule_engine.matched_count"?: number;
    }
  | {
      ["event.name"]: "searchWorker.run";
      "search.op"?: "index" | "delete";
      "bookmark.id"?: string;
      "search.document_size"?: number;
    }
  | {
      ["event.name"]: "backupWorker.run";
      "backup.id"?: string;
      "backup.bookmark_count"?: number;
      "backup.uncompressed_size"?: number;
      "backup.compressed_size"?: number;
    }
  // Product Events
  | {
      ["event.name"]: "user.login";
      ["user.id"]: string;
      "auth.provider": "credentials" | "oauth";
    }
  | {
      ["event.name"]: "user.login_failed";
      "user.email"?: string;
      "auth.failure_reason": string;
    }
  | {
      ["event.name"]: "user.signup";
      ["user.id"]?: string;
      "auth.provider": "credentials" | "oauth";
      "auth.failure_reason"?: string;
    }
  | { ["event.name"]: "user.password_change" }
  | {
      ["event.name"]: "user.delete";
      "user.deleted_id": string;
      "user.deleted_by": "self" | "admin";
    }
  | { ["event.name"]: "apiKey.revoke"; "apiKey.id": string }
  | {
      ["event.name"]: "bookmark.create";
      ["user.id"]: string;
      "bookmark.type": string;
      "bookmark.id": string;
      "bookmark.source"?: string;
      "bookmark.url"?: string;
      "bookmark.domain"?: string;
      "bookmark.asset_type"?: string;
      "bookmark.has_precrawled"?: boolean;
      "bookmark.crawl_priority"?: string;
      "bookmark.already_existed"?: boolean;
    }
  | { ["event.name"]: "bookmark.delete"; "bookmark.id"?: string }
  | {
      ["event.name"]: "bookmark.archive";
      "bookmark.id"?: string;
      "bookmark.archived"?: boolean;
    }
  | {
      ["event.name"]: "bookmark.favorite";
      "bookmark.id"?: string;
      "bookmark.favorited"?: boolean;
    }
  | {
      ["event.name"]: "bookmark.import";
      "import.source"?: string;
      "import.count"?: number;
    }
  | { ["event.name"]: "list.create"; "list.id"?: string }
  | {
      ["event.name"]: "list.share";
      "list.id"?: string;
      "list.public"?: boolean;
    }
  | { ["event.name"]: "tag.create"; "tag.id"?: string }
  | {
      ["event.name"]: "apiKey.create";
      "apiKey.id"?: string;
      "apiKey.source"?: "session" | "exchange";
    }
  | {
      ["event.name"]: "search.query";
      "search.has_query"?: boolean;
      "search.results_count"?: number;
    }
  | { ["event.name"]: "bookmarks.queried" }
  | {
      ["event.name"]: "subscription.checkout_started";
      "subscription.billing_period": "monthly" | "yearly";
    }
  | { ["event.name"]: "subscription.portal_opened" }
  | {
      ["event.name"]: "subscription.synced";
      "stripe.customer_id"?: string;
      "subscription.tier"?: string;
      "subscription.status"?: string;
      "subscription.prev_tier"?: string;
      "subscription.prev_status"?: string;
      "subscription.sync_skipped_reason"?: "unknown_customer";
      "subscription.cancel_at_period_end"?: boolean;
      "subscription.transition"?:
        | "upgrade"
        | "downgrade"
        | "renewed"
        | "scheduled_cancellation"
        | "resubscribe"
        | "no_change";
    }
  | {
      ["event.name"]: "subscription.webhook_received";
      "stripe.event_type": string;
      "stripe.customer_id"?: string;
    };

interface CommonEventLogFields {
  ["job.id"]: string;
  ["job.priority"]: number;
  ["job.run_number"]: number;
  ["user.id"]: string;
  ["user.role"]: string;
  ["user.tier"]: string;
  "bookmark.id"?: string;
}

export type EventLog = Partial<CommonEventLogFields> & EventLogInternal;

export type EventLogType = EventLog["event.name"];
