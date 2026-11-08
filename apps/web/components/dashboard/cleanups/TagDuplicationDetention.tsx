"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { distance } from "fastest-levenshtein";
import { CircleCheck, Check, Combine, X } from "lucide-react";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

interface Suggestion {
  mergeIntoId: string;
  tags: { id: string; name: string }[];
}

function normalizeTag(tag: string) {
  return tag.toLocaleLowerCase().replace(/[ -_]/g, "");
}

const useSuggestions = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  function updateMergeInto(suggestion: Suggestion, newMergeIntoId: string) {
    setSuggestions((prev) =>
      prev.map((s) =>
        s === suggestion ? { ...s, mergeIntoId: newMergeIntoId } : s,
      ),
    );
  }

  function deleteSuggestion(suggestion: Suggestion) {
    setSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  return { suggestions, updateMergeInto, deleteSuggestion, setSuggestions };
};

function ApplyAllButton({ suggestions }: { suggestions: Suggestion[] }) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const { mutateAsync } = useMergeTag({
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const applyAll = async (setDialogOpen: (open: boolean) => void) => {
    const promises = suggestions.map((suggestion) =>
      mutateAsync({
        intoTagId: suggestion.mergeIntoId,
        fromTagIds: suggestion.tags
          .filter((t) => t.id != suggestion.mergeIntoId)
          .map((t) => t.id),
      }),
    );
    setApplying(true);
    await Promise.all(promises)
      .then(() => {
        toast({
          description: "All suggestions applied",
        });
      })
      .catch(() => ({}))
      .finally(() => {
        setApplying(false);
        setDialogOpen(false);
      });
  };

  return (
    <ActionConfirmingDialog
      title={t("cleanups.duplicate_tags.merge_all_suggestions")}
      description={`Are you sure you want to apply all ${suggestions.length} suggestions?`}
      actionButton={(setDialogOpen) => (
        <ActionButton
          loading={applying}
          variant="destructive"
          onClick={() => applyAll(setDialogOpen)}
        >
          <Check className="size-4" />
          {t("actions.apply_all")}
        </ActionButton>
      )}
    >
      <Button variant="destructive">
        <Check className="size-4" />
        {t("actions.apply_all")}
      </Button>
    </ActionConfirmingDialog>
  );
}

function SuggestionRow({
  suggestion,
  updateMergeInto,
  deleteSuggestion,
}: {
  suggestion: Suggestion;
  updateMergeInto: (suggestion: Suggestion, newMergeIntoId: string) => void;
  deleteSuggestion: (suggestion: Suggestion) => void;
}) {
  const { t } = useTranslation();
  const { mutate, isPending } = useMergeTag({
    onSuccess: () => {
      toast({
        description: "Tags merged",
      });
    },
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });
  return (
    <TableRow key={suggestion.mergeIntoId}>
      <TableCell className="flex flex-wrap gap-1">
        {suggestion.tags.map((tag, idx) => {
          const selected = suggestion.mergeIntoId == tag.id;
          return (
            <div key={idx} className="group relative">
              <Link
                href={`/dashboard/tags/${tag.id}`}
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "text-sm",
                  selected ? "border border-foreground/60" : null,
                )}
              >
                {tag.name}
              </Link>
              <Button
                size="none"
                aria-label={`Keep ${tag.name}`}
                title={`Keep ${tag.name}`}
                className={cn(
                  "-translate-1/2 absolute -right-1.5 -top-1.5 rounded-full p-0.5",
                  selected ? null : "hidden group-hover:block",
                )}
                onClick={() => updateMergeInto(suggestion, tag.id)}
              >
                <Check className="size-3" />
              </Button>
            </div>
          );
        })}
      </TableCell>
      <TableCell className="space-x-1 space-y-1 text-center">
        <ActionButton
          loading={isPending}
          onClick={() =>
            mutate({
              intoTagId: suggestion.mergeIntoId,
              fromTagIds: suggestion.tags
                .filter((t) => t.id != suggestion.mergeIntoId)
                .map((t) => t.id),
            })
          }
        >
          <Combine className="size-4" />
          {t("actions.merge")}
        </ActionButton>

        <Button
          variant={"secondary"}
          onClick={() => deleteSuggestion(suggestion)}
        >
          <X className="size-4" />
          {t("actions.ignore")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function TagDuplicationDetection() {
  const api = useTRPC();
  const [expanded, setExpanded] = useState(false);
  const { data: allTags } = useQuery(
    api.tags.list.queryOptions(
      {},
      {
        refetchOnWindowFocus: false,
      },
    ),
  );

  const { suggestions, updateMergeInto, setSuggestions, deleteSuggestion } =
    useSuggestions();

  useEffect(() => {
    const sortedTags = [...(allTags?.tags ?? [])].sort((a, b) =>
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
    setSuggestions(initialSuggestions);
  }, [allTags]);

  if (!allTags) {
    return <LoadingSpinner />;
  }

  if (suggestions.length === 0) {
    return (
      <EmptyState
        compact
        icon={CircleCheck}
        title="No duplicate tags found"
        description="Tags with nearly identical names show up here so you can merge them."
      />
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {suggestions.length === 1
            ? "You have 1 suggestion for tag merging."
            : `You have ${suggestions.length} suggestions for tag merging.`}
        </span>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            {expanded ? "Hide all" : "Show all"}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <p className="mt-2 text-sm text-muted-foreground">
          For every suggestion, select the tag that you want to keep and other
          tags will be merged into it.
        </p>
        {suggestions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tags</TableHead>
                <TableHead className="text-center">
                  <ApplyAllButton suggestions={suggestions} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((suggestion) => (
                <SuggestionRow
                  key={suggestion.mergeIntoId}
                  suggestion={suggestion}
                  updateMergeInto={updateMergeInto}
                  deleteSuggestion={deleteSuggestion}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
