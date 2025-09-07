import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

const searchHistorySchema = z.array(z.string());

const BOOKMARK_SEARCH_HISTORY_KEY = "karakeep_search_history";
const MAX_STORED_ITEMS = 50;

class SearchHistoryUtil {
  constructor(
    private storage: {
      getItem(key: string): Promise<string | null> | string | null;
      setItem(key: string, value: string): Promise<void> | void;
      removeItem(key: string): Promise<void> | void;
    },
  ) {}

  async getSearchHistory(): Promise<string[]> {
    try {
      const rawHistory = await this.storage.getItem(
        BOOKMARK_SEARCH_HISTORY_KEY,
      );
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory) as unknown;
        const result = searchHistorySchema.safeParse(parsed);
        if (result.success) {
          return result.data;
        }
      }
      return [];
    } catch (error) {
      console.error("Failed to parse search history:", error);
      return [];
    }
  }

  async addSearchTermToHistory(term: string): Promise<void> {
    if (!term || term.trim().length === 0) {
      return;
    }
    try {
      const currentHistory = await this.getSearchHistory();
      const filteredHistory = currentHistory.filter(
        (item) => item.toLowerCase() !== term.toLowerCase(),
      );
      const newHistory = [term, ...filteredHistory];
      const finalHistory = newHistory.slice(0, MAX_STORED_ITEMS);
      await this.storage.setItem(
        BOOKMARK_SEARCH_HISTORY_KEY,
        JSON.stringify(finalHistory),
      );
    } catch (error) {
      console.error("Failed to save search history:", error);
    }
  }

  async clearSearchHistory(): Promise<void> {
    try {
      await this.storage.removeItem(BOOKMARK_SEARCH_HISTORY_KEY);
    } catch (error) {
      console.error("Failed to clear search history:", error);
    }
  }
}

export function useSearchHistory(adapter: {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const searchHistoryUtil = useMemo(() => new SearchHistoryUtil(adapter), []);

  const loadHistory = useCallback(async () => {
    const storedHistory = await searchHistoryUtil.getSearchHistory();
    setHistory(storedHistory);
  }, [searchHistoryUtil]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const addTerm = useCallback(
    async (term: string) => {
      await searchHistoryUtil.addSearchTermToHistory(term);
      await loadHistory();
    },
    [searchHistoryUtil, loadHistory],
  );

  const clearHistory = useCallback(async () => {
    await searchHistoryUtil.clearSearchHistory();
    setHistory([]);
  }, [searchHistoryUtil]);

  return {
    history,
    addTerm,
    clearHistory,
    refreshHistory: loadHistory,
  };
}
