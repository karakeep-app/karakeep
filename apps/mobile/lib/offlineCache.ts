import type { DehydratedState, Query } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import {
  defaultShouldDehydrateQuery,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { createMMKV } from "react-native-mmkv";
import superjson from "superjson";

// In-memory garbage collection must not evict entries before persistence does.
export const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

export function makeMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: CACHE_MAX_AGE,
      },
    },
  });
}

type DehydratedQuery = DehydratedState["queries"][number];

interface PersistedIndex {
  timestamp: number;
  buster: string;
  hashes: string[];
}

const INDEX_KEY = "index:v1";
const QUERY_PREFIX = "query:v1:";
// persistQueryClientSubscribe saves on every single cache event; the stock
// persister throttled internally, so a hand-rolled one has to do it itself.
const PERSIST_THROTTLE = 5_000;

const queryCacheStorage = createMMKV({
  id: "karakeep-query-cache",
});

function shardKey(queryHash: string) {
  return `${QUERY_PREFIX}${queryHash}`;
}

// queryHash -> the dataUpdatedAt already on disk. This is what keeps a save
// from re-serializing queries whose data did not move.
const persistedAt = new Map<string, number>();

// This MMKV instance belongs entirely to the query cache, so anything that is
// neither the index nor a live shard is garbage — orphaned shards, and the
// single blob written by the previous persister.
function removeStaleKeys(keep: ReadonlySet<string>) {
  for (const key of queryCacheStorage.getAllKeys()) {
    if (key !== INDEX_KEY && !keep.has(key)) {
      queryCacheStorage.remove(key);
    }
  }
}

// A guard rather than a zod schema: QueryState is react-query's type, not ours.
// Modelling it would mean mirroring 12 internal fields (including `error:
// Error | null`, which no schema round-trips cleanly) and silently dropping any
// field a future version adds, since zod objects strip unknown keys. Checking
// the fields we depend on and passing the value through avoids both.
function isDehydratedQuery(value: unknown): value is DehydratedQuery {
  return (
    typeof value === "object" &&
    value !== null &&
    "queryHash" in value &&
    typeof value.queryHash === "string" &&
    "queryKey" in value &&
    Array.isArray(value.queryKey) &&
    "state" in value &&
    typeof value.state === "object" &&
    value.state !== null &&
    "dataUpdatedAt" in value.state &&
    typeof value.state.dataUpdatedAt === "number"
  );
}

function parseIndex(value: unknown): PersistedIndex | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("timestamp" in value) ||
    typeof value.timestamp !== "number" ||
    !("buster" in value) ||
    typeof value.buster !== "string" ||
    !("hashes" in value) ||
    !Array.isArray(value.hashes)
  ) {
    return undefined;
  }

  return {
    timestamp: value.timestamp,
    buster: value.buster,
    hashes: value.hashes.filter(
      (hash: unknown): hash is string => typeof hash === "string",
    ),
  };
}

function writeClient(client: PersistedClient) {
  const hashes: string[] = [];
  const live = new Set<string>();

  for (const query of client.clientState.queries) {
    const { queryHash } = query;
    hashes.push(queryHash);
    live.add(queryHash);
    // Only successful queries are dehydrated, so data is the thing worth
    // tracking; a changed error on an already-cached query does not matter.
    if (persistedAt.get(queryHash) === query.state.dataUpdatedAt) {
      continue;
    }
    queryCacheStorage.set(shardKey(queryHash), superjson.stringify(query));
    persistedAt.set(queryHash, query.state.dataUpdatedAt);
  }

  // Queries that left the cache leave their shard behind: nothing reports a
  // removal, they simply stop appearing here. Deleting the entry being visited
  // is well defined for a Map iterator.
  for (const queryHash of persistedAt.keys()) {
    if (!live.has(queryHash)) {
      queryCacheStorage.remove(shardKey(queryHash));
      persistedAt.delete(queryHash);
    }
  }

  const index: PersistedIndex = {
    timestamp: client.timestamp,
    buster: client.buster,
    hashes,
  };
  // Written last: a torn save leaves unreferenced shards, which the next
  // restore sweeps, rather than an index pointing at data that never landed.
  queryCacheStorage.set(INDEX_KEY, superjson.stringify(index));
}

let pendingClient: PersistedClient | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flushPendingClient() {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = undefined;
  const client = pendingClient;
  pendingClient = undefined;
  if (client) {
    writeClient(client);
  }
}

function discardPersistedCache() {
  pendingClient = undefined;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  persistedAt.clear();
  queryCacheStorage.clearAll();
}

// One MMKV entry per query instead of one blob for the whole cache, so a save
// rewrites only what changed. The index is the authority on what exists:
// restoring from a key scan would resurrect queries that were evicted.
export const queryPersister: Persister = {
  persistClient: (client) => {
    pendingClient = client;
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingClient, PERSIST_THROTTLE);
    }
  },

  restoreClient: () => {
    const rawIndex = queryCacheStorage.getString(INDEX_KEY);
    if (!rawIndex) {
      removeStaleKeys(new Set());
      return undefined;
    }

    let index: PersistedIndex | undefined;
    try {
      index = parseIndex(superjson.parse<unknown>(rawIndex));
    } catch {
      index = undefined;
    }
    if (!index) {
      discardPersistedCache();
      return undefined;
    }

    const queries: DehydratedQuery[] = [];
    const live = new Set<string>();
    persistedAt.clear();

    for (const queryHash of index.hashes) {
      const raw = queryCacheStorage.getString(shardKey(queryHash));
      if (!raw) {
        continue;
      }

      let query: DehydratedQuery | undefined;
      try {
        const parsed = superjson.parse<unknown>(raw);
        query =
          isDehydratedQuery(parsed) && parsed.queryHash === queryHash
            ? parsed
            : undefined;
      } catch {
        query = undefined;
      }
      if (!query) {
        continue;
      }

      queries.push(query);
      live.add(shardKey(queryHash));
      persistedAt.set(queryHash, query.state.dataUpdatedAt);
    }

    // Cold start is the only chance to notice shards orphaned by the previous
    // run, since persistedAt starts empty.
    removeStaleKeys(live);

    return {
      timestamp: index.timestamp,
      buster: index.buster,
      clientState: { mutations: [], queries },
    };
  },

  removeClient: discardPersistedCache,
};

export function clearPersistedCache() {
  discardPersistedCache();
}

export function setupCachePersistence() {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") {
      flushPendingClient();
    }
  });

  return () => {
    subscription.remove();
    flushPendingClient();
  };
}

// The persister keys by query, but a query's own value is still written whole.
// Article bodies are megabytes each; durable copies of those belong in the
// offline library instead.
function fetchesArticleContent(queryKey: readonly unknown[]) {
  return queryKey.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      "input" in part &&
      typeof part.input === "object" &&
      part.input !== null &&
      "includeContent" in part.input &&
      part.input.includeContent === true,
  );
}

export const dehydrateOptions = {
  // Mutation functions are not serializable, and this app does not register
  // resumable mutation defaults after hydration.
  shouldDehydrateMutation: () => false,
  shouldDehydrateQuery: (query: Query) =>
    defaultShouldDehydrateQuery(query) &&
    !fetchesArticleContent(query.queryKey),
};

// React Query otherwise assumes React Native is always online.
export function setupOnlineManager() {
  onlineManager.setEventListener((setOnline) => {
    let active = true;
    const updateOnlineState = (state: Network.NetworkState) => {
      setOnline(state.isInternetReachable ?? state.isConnected ?? true);
    };

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) {
          updateOnlineState(state);
        }
      })
      .catch(() => {
        if (active) {
          setOnline(true);
        }
      });

    const subscription = Network.addNetworkStateListener(updateOnlineState);
    return () => {
      active = false;
      subscription.remove();
    };
  });
}
