"use client";

import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";

const DEBOUNCE_MS = 400;

/**
 * What a smart list would hold, before it's created. `query` must be a valid
 * smart list query, or empty while there's nothing valid to preview yet, in which
 * case it says what's missing. `invalid` tells a query being fixed from no query.
 */
export function SmartListPreview({
  query,
  invalid = false,
}: {
  query: string;
  invalid?: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const { data, isError, isFetching } = useQuery(
    api.lists.previewSmartQuery.queryOptions(
      { query: debouncedQuery },
      {
        enabled: debouncedQuery.length > 0,
        placeholderData: keepPreviousData,
        retry: false,
      },
    ),
  );

  if (!query) {
    return (
      <p
        aria-live="polite"
        className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        {t(invalid ? "lists.preview.fix_query" : "lists.preview.empty_query")}
      </p>
    );
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        "rounded-md bg-muted px-3 py-2 text-sm transition-opacity",
        (isFetching || query !== debouncedQuery) && "opacity-60",
      )}
    >
      {isError ? (
        <p className="text-muted-foreground">{t("lists.preview.failed")}</p>
      ) : !data ? (
        <p className="text-muted-foreground">{t("lists.preview.checking")}</p>
      ) : data.count === 0 ? (
        <>
          <p className="font-medium">{t("lists.preview.no_matches")}</p>
          <p className="text-muted-foreground">
            {t("lists.preview.no_matches_description")}
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">
            {t("lists.preview.count", { count: data.count })}
          </p>
          {data.sample.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {data.sample.map((bookmark) => (
                <li key={bookmark.id} className="truncate">
                  {bookmark.title ?? t("common.untitled")}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
