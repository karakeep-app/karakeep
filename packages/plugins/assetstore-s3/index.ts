import type { AssetStore } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import type { PluginProvider } from "@karakeep/shared/plugins";

interface S3AssetStoreOptions {
  region?: string;
  endpoint: string;
  forcePathStyle: boolean;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3AssetStoreProvider implements PluginProvider<AssetStore> {
  private client: AssetStore | null = null;

  constructor(private readonly options: S3AssetStoreOptions) {}

  async getClient(): Promise<AssetStore> {
    if (!this.client) {
      const [{ S3Client }, { S3AssetStore }] = await Promise.all([
        import("@aws-sdk/client-s3"),
        import("./src"),
      ]);
      if (!this.client) {
        const s3Client = new S3Client({
          region: this.options.region,
          endpoint: this.options.endpoint,
          forcePathStyle: this.options.forcePathStyle,
          credentials: {
            accessKeyId: this.options.accessKeyId,
            secretAccessKey: this.options.secretAccessKey,
          },
        });
        this.client = new S3AssetStore(s3Client, this.options.bucket);
      }
    }
    return this.client;
  }
}

const config = serverConfig.assetStore;
if (config.type === "s3") {
  if (!config.s3.bucket) {
    throw new Error(
      "ASSET_STORE_S3_BUCKET is required when using S3 asset store",
    );
  }
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
    throw new Error(
      "ASSET_STORE_S3_ACCESS_KEY_ID and ASSET_STORE_S3_SECRET_ACCESS_KEY are required when using S3 asset store",
    );
  }

  PluginManager.register({
    type: PluginType.AssetStore,
    name: "S3",
    provider: new S3AssetStoreProvider({
      region: config.s3.region,
      endpoint: config.s3.endpoint!,
      forcePathStyle: config.s3.forcePathStyle,
      bucket: config.s3.bucket,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    }),
  });
}
