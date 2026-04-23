import { z } from "zod";

export const API_KEY_FULL_ACCESS_SCOPE = "fullaccess";

export const API_KEY_SCOPE_RESOURCES = [
  "assets",
  "backups",
  "bookmarks",
  "feeds",
  "highlights",
  "lists",
  "prompts",
  "rules",
  "tags",
  "users",
  "webhooks",
  "importSessions",
  "subscriptions",
] as const;

export const API_KEY_ADMIN_SCOPE_RESOURCES = [
  "bookmarks",
  "jobs",
  "system",
  "users",
] as const;

export const API_KEY_SCOPE_ACCESS = ["read", "readwrite"] as const;

export const zApiKeyScopeResourceSchema = z.enum(API_KEY_SCOPE_RESOURCES);
export type ZApiKeyScopeResource = z.infer<typeof zApiKeyScopeResourceSchema>;

export const zApiKeyAdminScopeResourceSchema = z.enum(
  API_KEY_ADMIN_SCOPE_RESOURCES,
);
export type ZApiKeyAdminScopeResource = z.infer<
  typeof zApiKeyAdminScopeResourceSchema
>;

export const zApiKeyScopeAccessSchema = z.enum(API_KEY_SCOPE_ACCESS);
export type ZApiKeyScopeAccess = z.infer<typeof zApiKeyScopeAccessSchema>;

export const API_KEY_RESOURCE_SCOPES = API_KEY_SCOPE_RESOURCES.flatMap(
  (resource) =>
    API_KEY_SCOPE_ACCESS.map((access) => `${resource}:${access}` as const),
);

export const API_KEY_ADMIN_SCOPES = API_KEY_ADMIN_SCOPE_RESOURCES.flatMap(
  (resource) =>
    API_KEY_SCOPE_ACCESS.map(
      (access) => `admin:${resource}:${access}` as const,
    ),
);

export const API_KEY_SCOPES = [
  API_KEY_FULL_ACCESS_SCOPE,
  ...API_KEY_RESOURCE_SCOPES,
  ...API_KEY_ADMIN_SCOPES,
] as const;

export const API_KEY_SCOPES_WITHOUT_FULL_ACCESS = [
  ...API_KEY_RESOURCE_SCOPES,
  ...API_KEY_ADMIN_SCOPES,
] as const;

export const zApiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export type ZApiKeyScope = z.infer<typeof zApiKeyScopeSchema>;

export const zApiKeyScopesSchema = z.array(zApiKeyScopeSchema).min(1);

export function getApiKeyScope(
  resource: ZApiKeyScopeResource,
  access: ZApiKeyScopeAccess,
): ZApiKeyScope {
  return `${resource}:${access}`;
}

export function getAdminApiKeyScope(
  resource: ZApiKeyAdminScopeResource,
  access: ZApiKeyScopeAccess,
): ZApiKeyScope {
  return `admin:${resource}:${access}`;
}

function getReadWriteScopeForReadScope(scope: ZApiKeyScope) {
  return scope.endsWith(":read")
    ? (scope.replace(/:read$/, ":readwrite") as ZApiKeyScope)
    : null;
}

export function apiKeyScopesGrantScope(
  grantedScopes: ZApiKeyScope[],
  requiredScope: ZApiKeyScope,
) {
  if (grantedScopes.includes(API_KEY_FULL_ACCESS_SCOPE)) {
    return true;
  }

  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  const readWriteScope = getReadWriteScopeForReadScope(requiredScope);
  return readWriteScope ? grantedScopes.includes(readWriteScope) : false;
}
