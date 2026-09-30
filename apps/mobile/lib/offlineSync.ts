// Native storage and networking are injected so retention can be verified
// independently from the mobile runtime.
export interface OfflineSyncItem {
  id: string;
  content: { type: string };
}

export interface OfflineSyncProgress {
  completed: number;
  total: number;
  failed: number;
}

export async function syncOfflineArticles<T extends OfflineSyncItem, C>({
  count,
  signal,
  list,
  download,
  save,
  prune,
  onProgress,
}: {
  count: number;
  signal: AbortSignal;
  list: (cursor: C | null) => Promise<{ bookmarks: T[]; nextCursor: C | null }>;
  download: (id: string) => Promise<T>;
  save: (bookmark: T) => void;
  prune: (keep: ReadonlySet<string>) => void;
  onProgress: (progress: OfflineSyncProgress) => void;
}) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error("Choose between 1 and 1000 articles.");
  }
  const checkCancelled = () => {
    if (signal.aborted) throw new Error("Download cancelled.");
  };
  const selected: string[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: C | null = null;
  // Mixed libraries can contain many unsupported assets. Bound pagination
  // even when there are fewer readable articles than requested.
  for (let page = 0; page < 50; page++) {
    checkCancelled();
    const result = await list(cursor);
    checkCancelled();
    for (const bookmark of result.bookmarks) {
      if (seen.has(bookmark.id)) continue;
      seen.add(bookmark.id);
      if (bookmark.content.type !== "link" && bookmark.content.type !== "text")
        continue;
      selected.push(bookmark.id);
      if (selected.length === count) break;
    }
    if (selected.length === count || result.nextCursor === null) break;
    const cursorKey = JSON.stringify(result.nextCursor);
    if (cursors.has(cursorKey) || page === 49) {
      throw new Error(
        "Could not finish listing recent articles. Existing copies were kept.",
      );
    }
    cursors.add(cursorKey);
    cursor = result.nextCursor;
  }

  const progress = { completed: 0, total: selected.length, failed: 0 };
  onProgress({ ...progress });
  for (const id of selected) {
    checkCancelled();
    try {
      const bookmark = await download(id);
      checkCancelled();
      if (bookmark.id !== id) throw new Error("Unexpected article returned.");
      save(bookmark);
    } catch {
      checkCancelled();
      progress.failed++;
    }
    progress.completed++;
    onProgress({ ...progress });
  }
  checkCancelled();
  // Partial failure must not evict previously available articles.
  if (progress.failed === 0) prune(new Set(selected));
  return progress;
}
