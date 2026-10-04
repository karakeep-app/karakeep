import type { AssetStore } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import type { PluginProvider } from "@karakeep/shared/plugins";

export class FileSystemAssetStoreProvider implements PluginProvider<AssetStore> {
  private client: AssetStore | null = null;

  async getClient(): Promise<AssetStore> {
    if (!this.client) {
      const { LocalFileSystemAssetStore } = await import("./src");
      if (!this.client) {
        this.client = new LocalFileSystemAssetStore(serverConfig.assetsDir);
      }
    }
    return this.client;
  }
}

PluginManager.register({
  type: PluginType.AssetStore,
  name: "Filesystem",
  provider: new FileSystemAssetStoreProvider(),
});
