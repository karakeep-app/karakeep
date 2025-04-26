"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import LoadingSpinner from "@/components/ui/spinner";
import { api } from "@/lib/trpc";
import { distance } from "fastest-levenshtein";

import TagSuggestionList from "./TagSuggestionList";
import { Tags } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";

interface Suggestion {
  mergeIntoId: string;
  tags: { id: string; name: string }[];
}

function normalizeTag(tag: string) {
  return tag.toLocaleLowerCase().replace(/[ -_]/g, "");
}

export function TagDuplicationDetection() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  let { data: allTags } = api.tags.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const suggestions = useMemo(() => {
    allTags = allTags ?? { tags: [] };
    const sortedTags = allTags.tags.sort((a, b) =>
      normalizeTag(a.name).localeCompare(normalizeTag(b.name)),
    );

    const initialSuggestions: Suggestion[] = [];
    for (let i = 0; i < sortedTags.length; i++) {
      const currentName = normalizeTag(sortedTags[i].name);
      const suggestion = [sortedTags[i]];
      for (let j = i + 1; j < sortedTags.length; j++) {
        const nextName = normalizeTag(sortedTags[j].name);
        if (distance(currentName, nextName) <= 1) {
          suggestion.push(sortedTags[j]);
        } else {
          break;
        }
      }
      if (suggestion.length > 1) {
        initialSuggestions.push({
          mergeIntoId: suggestion[0].id,
          tags: suggestion,
        });
        i += suggestion.length - 1;
      }
    }
    return initialSuggestions;
  }, [allTags]);

  if (!allTags) {
    return <LoadingSpinner />;
  }

  return (
    <Collapsible className="rounded-md border p-4" open={expanded} onOpenChange={setExpanded}>
      <span className="flex items-center gap-1 text-xl">
        <Tags />
        {t("cleanups.duplicate_tags.title")}
      </span>
      You have {suggestions.length} suggestions for tag merging.
      {suggestions.length > 0 && (
        <CollapsibleTrigger asChild>
          <Button variant="link" size="sm">
            {expanded ? "Hide All" : "Show All"}
          </Button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        <p className="text-sm italic text-muted-foreground">
          For every suggestion, select the tag that you want to keep and other
          tags will be merged into it.
        </p>
        {suggestions.length > 0 && (
          <TagSuggestionList suggestions={suggestions} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
