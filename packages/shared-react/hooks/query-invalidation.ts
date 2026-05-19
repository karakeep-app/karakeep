import { hashKey, QueryClient, QueryFilters } from "@tanstack/react-query";

const DEFAULT_INVALIDATION_DEBOUNCE_MS = 250;
const DEFAULT_INVALIDATION_MAX_WAIT_MS = 3_000;

interface PendingInvalidation {
  filters: QueryFilters;
  timeout: ReturnType<typeof setTimeout>;
  firstRequestedAt: number;
}

const pendingInvalidations = new WeakMap<
  QueryClient,
  Map<string, PendingInvalidation>
>();

function getInvalidationKey(filters: QueryFilters) {
  return hashKey([
    filters.queryKey ?? null,
    filters.exact ?? null,
    filters.type ?? null,
    filters.stale ?? null,
    filters.fetchStatus ?? null,
  ]);
}

export function scheduleInvalidateQueries(
  queryClient: QueryClient,
  filters: QueryFilters,
  debounceMs = DEFAULT_INVALIDATION_DEBOUNCE_MS,
  maxWaitMs = DEFAULT_INVALIDATION_MAX_WAIT_MS,
) {
  // Predicate functions are not hashable; run them immediately to avoid
  // coalescing different predicate filters under the same structural key.
  if (filters.predicate) {
    void queryClient.invalidateQueries(filters);
    return;
  }

  let clientInvalidations = pendingInvalidations.get(queryClient);
  if (!clientInvalidations) {
    clientInvalidations = new Map();
    pendingInvalidations.set(queryClient, clientInvalidations);
  }

  const key = getInvalidationKey(filters);
  const now = Date.now();
  const pendingInvalidation = clientInvalidations.get(key);

  const invalidate = () => {
    const invalidation = clientInvalidations.get(key);
    if (!invalidation) {
      return;
    }

    clientInvalidations.delete(key);
    void queryClient.invalidateQueries(invalidation.filters);
  };

  if (pendingInvalidation) {
    clearTimeout(pendingInvalidation.timeout);

    const elapsedMs = now - pendingInvalidation.firstRequestedAt;
    const delayMs = Math.max(0, Math.min(debounceMs, maxWaitMs - elapsedMs));

    pendingInvalidation.filters = filters;
    pendingInvalidation.timeout = setTimeout(invalidate, delayMs);
    return;
  }

  const timeout = setTimeout(invalidate, debounceMs);

  clientInvalidations.set(key, {
    filters,
    timeout,
    firstRequestedAt: now,
  });
}
