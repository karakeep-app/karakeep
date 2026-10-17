import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RuleEngineCondition } from "@karakeep/shared/types/rules";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  getRuleConditionReferences,
  ruleConditionToSearchQuery,
} from "@karakeep/shared/utils/ruleUtils";

// Opens the bookmarks that currently match the rule's condition in a new tab
export function PreviewMatchesButton({
  condition,
}: {
  condition: RuleEngineCondition;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { tagIds, feedIds } = getRuleConditionReferences(condition);

  const { data: tags } = useQuery(
    api.tags.list.queryOptions(
      { ids: tagIds },
      {
        enabled: tagIds.length > 0,
        select: (data) =>
          Object.fromEntries(data.tags.map((tag) => [tag.id, tag.name])),
      },
    ),
  );
  const { data: feeds } = useQuery(
    api.feeds.list.queryOptions(undefined, {
      enabled: feedIds.length > 0,
      // Search can only filter feeds by name, so leave out the names that
      // more than one feed shares and the preview stays disabled for them.
      select: (data) =>
        Object.fromEntries(
          data.feeds
            .filter(
              (feed) =>
                data.feeds.filter((f) => f.name === feed.name).length === 1,
            )
            .map((feed) => [feed.id, feed.name]),
        ),
    }),
  );

  const query = ruleConditionToSearchQuery(condition, {
    tags: tags ?? {},
    feeds: feeds ?? {},
  });

  if (query === null) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled>
        <ExternalLink className="size-4" />
        {t("settings.rules.preview_matches")}
      </Button>
    );
  }

  // An empty query lists everything, including the archived bookmarks that
  // the home page hides
  const href = `/dashboard/search?q=${encodeURIComponent(query)}`;
  return (
    <Button type="button" variant="ghost" size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink className="size-4" />
        {t("settings.rules.preview_matches")}
      </a>
    </Button>
  );
}
