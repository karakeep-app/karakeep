// Implementation inspired from Outline

import logger from "./logger";
import { SearchIndexClient } from "./search";

export enum PluginType {
  Search = "search",
}

interface PluginTypeMap {
  [PluginType.Search]: SearchIndexClient;
}

export interface TPlugin<T extends PluginType> {
  type: T;
  name: string;
  provider: PluginProvider<PluginTypeMap[T]>;
}

export interface PluginProvider<T> {
  getClient(): Promise<T | null>;
}

export class PluginManager {
  private static providers = new Map<PluginType, TPlugin<PluginType>[]>();

  static register<T extends PluginType>(plugin: TPlugin<T>): void {
    const p = PluginManager.providers.get(plugin.type);
    if (!p) {
      PluginManager.providers.set(plugin.type, [plugin]);
      return;
    }
    p.push(plugin);
  }

  static async getClient<T extends PluginType>(
    type: T,
  ): Promise<PluginTypeMap[T] | null> {
    const provider = PluginManager.providers.get(type);
    if (!provider) {
      return null;
    }
    return await provider[provider.length - 1].provider.getClient();
  }

  static isRegistered<T extends PluginType>(type: T): boolean {
    return !!PluginManager.providers.get(type);
  }

  static logAllPlugins() {
    logger.info("Plugins (Last one wins):");
    for (const type of Object.values(PluginType)) {
      logger.info(`  ${type}:`);
      const plugins = PluginManager.providers.get(type);
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
