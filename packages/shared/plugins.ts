// Implementation inspired from Outline

import type { QueueClient } from "./queueing";
import logger from "./logger";
import { SearchIndexClient } from "./search";

export enum PluginType {
  Search = "search",
  Queue = "queue",
}

interface PluginTypeMap {
  [PluginType.Search]: SearchIndexClient;
  [PluginType.Queue]: QueueClient;
}

export interface TPlugin<T extends PluginType> {
  type: T;
  name: string;
  provider: PluginProvider<PluginTypeMap[T]>;
}

export interface PluginProvider<T> {
  getClient(): Promise<T | null>;
}

// Preserve the key-dependent value type: for K, store TPlugin<K>[]
type ProviderMap = { [K in PluginType]: TPlugin<K>[] };

export class PluginManager {
  private static providers: ProviderMap = {
    [PluginType.Search]: [],
    [PluginType.Queue]: [],
  };

  static register<T extends PluginType>(plugin: TPlugin<T>): void {
    PluginManager.providers[plugin.type].push(plugin);
  }

  static async getClient<T extends PluginType>(
    type: T,
  ): Promise<PluginTypeMap[T] | null> {
    const providers: TPlugin<T>[] = PluginManager.providers[type];
    if (providers.length === 0) {
      return null;
    }
    return await providers[providers.length - 1]!.provider.getClient();
  }

  static isRegistered<T extends PluginType>(type: T): boolean {
    return PluginManager.providers[type].length > 0;
  }

  static getPluginName<T extends PluginType>(type: T): string | null {
    const providers: TPlugin<T>[] = PluginManager.providers[type];
    if (providers.length === 0) {
      return null;
    }
    return providers[providers.length - 1]!.name;
  }

  static logAllPlugins() {
    logger.info("Plugins (Last one wins):");
    for (const type of Object.values(PluginType)) {
      logger.info(`  ${type}:`);
      const plugins = PluginManager.providers[type];
      if (!plugins) {
        logger.info("    - None");
        continue;
      }
      for (const plugin of plugins) {
        logger.info(`    - ${plugin.name}`);
      }
    }
  }
}
