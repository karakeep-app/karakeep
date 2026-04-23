import type {
  ZApiKeyAdminScopeResource,
  ZApiKeyScope,
  ZApiKeyScopeAccess,
  ZApiKeyScopeResource,
} from "@karakeep/shared/types/apiKeys";
import type { TFunction } from "i18next";
import {
  API_KEY_ADMIN_SCOPE_RESOURCES,
  API_KEY_FULL_ACCESS_SCOPE,
  API_KEY_SCOPE_RESOURCES,
  getAdminApiKeyScope,
  getApiKeyScope,
} from "@karakeep/shared/types/apiKeys";

export type ScopeAccessChoice = "none" | ZApiKeyScopeAccess;

export interface ScopeOption {
  id: ZApiKeyScopeResource | `admin:${ZApiKeyAdminScopeResource}`;
  labelKey: ApiKeyScopeTranslationKey;
  descriptionKey: ApiKeyScopeTranslationKey;
  readScope: ZApiKeyScope;
  readwriteScope: ZApiKeyScope;
  adminOnly?: boolean;
  hidden: boolean;
}

const RESOURCE_TRANSLATION_KEYS = {
  assets: {
    labelKey: "settings.api_keys.scopes.resources.assets.label",
    descriptionKey: "settings.api_keys.scopes.resources.assets.description",
    hidden: false,
  },
  backups: {
    labelKey: "settings.api_keys.scopes.resources.backups.label",
    descriptionKey: "settings.api_keys.scopes.resources.backups.description",
    hidden: false,
  },
  bookmarks: {
    labelKey: "settings.api_keys.scopes.resources.bookmarks.label",
    descriptionKey: "settings.api_keys.scopes.resources.bookmarks.description",
    hidden: false,
  },
  feeds: {
    labelKey: "settings.api_keys.scopes.resources.feeds.label",
    descriptionKey: "settings.api_keys.scopes.resources.feeds.description",
    hidden: false,
  },
  highlights: {
    labelKey: "settings.api_keys.scopes.resources.highlights.label",
    descriptionKey: "settings.api_keys.scopes.resources.highlights.description",
    hidden: false,
  },
  lists: {
    labelKey: "settings.api_keys.scopes.resources.lists.label",
    descriptionKey: "settings.api_keys.scopes.resources.lists.description",
    hidden: false,
  },
  prompts: {
    labelKey: "settings.api_keys.scopes.resources.prompts.label",
    descriptionKey: "settings.api_keys.scopes.resources.prompts.description",
    hidden: false,
  },
  rules: {
    labelKey: "settings.api_keys.scopes.resources.rules.label",
    descriptionKey: "settings.api_keys.scopes.resources.rules.description",
    hidden: false,
  },
  tags: {
    labelKey: "settings.api_keys.scopes.resources.tags.label",
    descriptionKey: "settings.api_keys.scopes.resources.tags.description",
    hidden: false,
  },
  users: {
    labelKey: "settings.api_keys.scopes.resources.users.label",
    descriptionKey: "settings.api_keys.scopes.resources.users.description",
    hidden: false,
  },
  webhooks: {
    labelKey: "settings.api_keys.scopes.resources.webhooks.label",
    descriptionKey: "settings.api_keys.scopes.resources.webhooks.description",
    hidden: false,
  },
  importSessions: {
    labelKey: "settings.api_keys.scopes.resources.importSessions.label",
    descriptionKey:
      "settings.api_keys.scopes.resources.importSessions.description",
    hidden: true,
  },
  subscriptions: {
    labelKey: "settings.api_keys.scopes.resources.subscriptions.label",
    descriptionKey:
      "settings.api_keys.scopes.resources.subscriptions.description",
    hidden: true,
  },
} as const satisfies Record<
  ZApiKeyScopeResource,
  { labelKey: string; descriptionKey: string; hidden: boolean }
>;

const ADMIN_RESOURCE_TRANSLATION_KEYS = {
  bookmarks: {
    labelKey: "settings.api_keys.scopes.admin_resources.bookmarks.label",
    descriptionKey:
      "settings.api_keys.scopes.admin_resources.bookmarks.description",
  },
  jobs: {
    labelKey: "settings.api_keys.scopes.admin_resources.jobs.label",
    descriptionKey: "settings.api_keys.scopes.admin_resources.jobs.description",
  },
  system: {
    labelKey: "settings.api_keys.scopes.admin_resources.system.label",
    descriptionKey:
      "settings.api_keys.scopes.admin_resources.system.description",
  },
  users: {
    labelKey: "settings.api_keys.scopes.admin_resources.users.label",
    descriptionKey:
      "settings.api_keys.scopes.admin_resources.users.description",
  },
} as const satisfies Record<
  ZApiKeyAdminScopeResource,
  { labelKey: string; descriptionKey: string }
>;

type ResourceTranslationKey =
  | (typeof RESOURCE_TRANSLATION_KEYS)[keyof typeof RESOURCE_TRANSLATION_KEYS]["labelKey"]
  | (typeof RESOURCE_TRANSLATION_KEYS)[keyof typeof RESOURCE_TRANSLATION_KEYS]["descriptionKey"];

type AdminResourceTranslationKey =
  | (typeof ADMIN_RESOURCE_TRANSLATION_KEYS)[keyof typeof ADMIN_RESOURCE_TRANSLATION_KEYS]["labelKey"]
  | (typeof ADMIN_RESOURCE_TRANSLATION_KEYS)[keyof typeof ADMIN_RESOURCE_TRANSLATION_KEYS]["descriptionKey"];

export type ApiKeyScopeTranslationKey =
  | ResourceTranslationKey
  | AdminResourceTranslationKey
  | "settings.api_keys.scopes.full_access.label"
  | "settings.api_keys.scopes.full_access.description";

export const FULL_ACCESS_SCOPE_OPTION = {
  scope: API_KEY_FULL_ACCESS_SCOPE,
  labelKey: "settings.api_keys.scopes.full_access.label",
  descriptionKey: "settings.api_keys.scopes.full_access.description",
} as const;

export const API_KEY_SCOPE_OPTIONS: ScopeOption[] = API_KEY_SCOPE_RESOURCES.map(
  (resource) => ({
    id: resource,
    labelKey: RESOURCE_TRANSLATION_KEYS[resource].labelKey,
    descriptionKey: RESOURCE_TRANSLATION_KEYS[resource].descriptionKey,
    readScope: getApiKeyScope(resource, "read"),
    readwriteScope: getApiKeyScope(resource, "readwrite"),
    hidden: RESOURCE_TRANSLATION_KEYS[resource].hidden,
  }),
);

export const API_KEY_ADMIN_SCOPE_OPTIONS: ScopeOption[] =
  API_KEY_ADMIN_SCOPE_RESOURCES.map((resource) => ({
    id: `admin:${resource}`,
    labelKey: ADMIN_RESOURCE_TRANSLATION_KEYS[resource].labelKey,
    descriptionKey: ADMIN_RESOURCE_TRANSLATION_KEYS[resource].descriptionKey,
    readScope: getAdminApiKeyScope(resource, "read"),
    readwriteScope: getAdminApiKeyScope(resource, "readwrite"),
    adminOnly: true,
    hidden: false,
  }));

export const API_KEY_ALL_SCOPE_OPTIONS = [
  ...API_KEY_SCOPE_OPTIONS,
  ...API_KEY_ADMIN_SCOPE_OPTIONS,
];

export function scopeLabel(t: TFunction, scope: ZApiKeyScope) {
  if (scope === API_KEY_FULL_ACCESS_SCOPE) {
    return t(FULL_ACCESS_SCOPE_OPTION.labelKey);
  }

  const option = API_KEY_ALL_SCOPE_OPTIONS.find(
    (candidate) =>
      candidate.readScope === scope || candidate.readwriteScope === scope,
  );
  if (!option) {
    return scope;
  }

  const accessLabel = scope.endsWith(":readwrite")
    ? t("settings.api_keys.scopes.access.readwrite")
    : t("settings.api_keys.scopes.access.read");

  return `${t(option.labelKey)}: ${accessLabel}`;
}

export function isAdminScope(scope: ZApiKeyScope) {
  return scope.startsWith("admin:");
}
