import { eq, sum } from "drizzle-orm";

import type { DB, KarakeepDBTransaction } from "@karakeep/db";
import { assets, users } from "@karakeep/db/schema";
import { QuotaApproved } from "@karakeep/shared/storageQuota";

export class StorageQuotaError extends Error {
  constructor(
    public readonly currentUsage: number,
    public readonly quota: number,
    public readonly requestedSize: number,
  ) {
    super(
      `Storage quota exceeded. Current usage: ${Math.round(currentUsage / 1024 / 1024)}MB, Quota: ${Math.round(quota / 1024 / 1024)}MB, Requested: ${Math.round(requestedSize / 1024 / 1024)}MB`,
    );
    this.name = "StorageQuotaError";
  }
}

export async function checkStorageQuota(
  db: DB | KarakeepDBTransaction,
  userId: string,
  requestedSize: number,
): Promise<QuotaApproved> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      storageQuota: true,
    },
  });

  if (user?.storageQuota === null || user?.storageQuota === undefined) {
    // No quota limit - approve the request
    return QuotaApproved._create(userId, requestedSize);
  }

  const currentUsage = await getCurrentStorageUsage(db, userId);

  if (currentUsage + requestedSize > user.storageQuota) {
    throw new StorageQuotaError(currentUsage, user.storageQuota, requestedSize);
  }

  // Quota check passed - return approval token
  return QuotaApproved._create(userId, requestedSize);
}

export async function getCurrentStorageUsage(
  db: DB | KarakeepDBTransaction,
  userId: string,
): Promise<number> {
  const currentUsageResult = await db
    .select({ totalSize: sum(assets.size) })
    .from(assets)
    .where(eq(assets.userId, userId));

  return Number(currentUsageResult[0]?.totalSize ?? 0);
}
