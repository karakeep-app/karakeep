import { eq } from "drizzle-orm";

import { db } from "@karakeep/db";
import { assets } from "@karakeep/db/schema";
import {
  ZAdminMaintenanceTidyAssetsTask,
  ZTidyAssetsRequest,
  zTidyAssetsRequestSchema,
} from "@karakeep/shared-server";
import { deleteAsset, getAllAssets } from "@karakeep/shared/assetdb";
import logger from "@karakeep/shared/logger";
import { DequeuedJob } from "@karakeep/shared/queueing";

async function handleAsset(
  asset: {
    assetId: string;
    userId: string;
    size: number;
    contentType: string;
    fileName?: string | null;
  },
  request: ZTidyAssetsRequest,
  jobId: string,
) {
  const dbRow = await db.query.assets.findFirst({
    where: eq(assets.id, asset.assetId),
  });
  if (!dbRow) {
    if (request.cleanDanglingAssets) {
      await deleteAsset({ userId: asset.userId, assetId: asset.assetId });
      logger.info(
        `[adminMaintenance:tidy_assets][${jobId}] Asset ${asset.assetId} not found in the database. Deleting it.`,
      );
    } else {
      logger.warn(
        `[adminMaintenance:tidy_assets][${jobId}] Asset ${asset.assetId} not found in the database. Not deleting it because cleanDanglingAssets is false.`,
      );
    }
    return;
  }

  if (request.syncAssetMetadata) {
    await db
      .update(assets)
      .set({
        contentType: asset.contentType,
        fileName: asset.fileName,
        size: asset.size,
      })
      .where(eq(assets.id, asset.assetId));
    logger.info(
      `[adminMaintenance:tidy_assets][${jobId}] Updated metadata for asset ${asset.assetId}`,
    );
  }
}

export async function runTidyAssetsTask(
  job: DequeuedJob<ZAdminMaintenanceTidyAssetsTask>,
  task: ZAdminMaintenanceTidyAssetsTask,
) {
  const jobId = job.id;
  const parseResult = zTidyAssetsRequestSchema.safeParse(task.args);
  if (!parseResult.success) {
    throw new Error(
      `[adminMaintenance:tidy_assets][${jobId}] Got malformed tidy asset args: ${parseResult.error.toString()}`,
    );
  }

  for await (const asset of getAllAssets()) {
    if (job.abortSignal.aborted) {
      logger.warn(`[adminMaintenance:tidy_assets][${jobId}] Aborted`);
      break;
    }
    try {
      await handleAsset(asset, parseResult.data, jobId);
    } catch (error) {
      logger.error(
        `[adminMaintenance:tidy_assets][${jobId}] Failed to tidy asset ${asset.assetId}: ${error}`,
      );
    }
  }
}
