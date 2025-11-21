import AsyncStorage from "@react-native-async-storage/async-storage";
import { type PersistedClient, type Persister } from "@tanstack/react-query-persist-client";

/**
 * Creates an AsyncStorage-based persister for React Query
 * This enables offline mode by persisting the React Query cache to AsyncStorage
 */
export function createAsyncStoragePersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await AsyncStorage.setItem("REACT_QUERY_OFFLINE_CACHE", JSON.stringify(client));
      } catch (error) {
        console.error("Failed to persist React Query cache:", error);
      }
    },
    restoreClient: async () => {
      try {
        const cachedClient = await AsyncStorage.getItem("REACT_QUERY_OFFLINE_CACHE");
        return cachedClient ? JSON.parse(cachedClient) : undefined;
      } catch (error) {
        console.error("Failed to restore React Query cache:", error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await AsyncStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
      } catch (error) {
        console.error("Failed to remove React Query cache:", error);
      }
    },
  };
}
