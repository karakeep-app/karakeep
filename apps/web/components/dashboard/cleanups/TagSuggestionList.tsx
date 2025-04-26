import { useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Check, Combine, X } from "lucide-react";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";

export interface Suggestion {
  mergeIntoId: string;
  tags: { id: string; name: string }[];
}

const useSuggestions = (_suggestion: Suggestion[]) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(_suggestion);

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
          description: "All suggestions has been applied!",
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
          <Check className="mr-2 size-4" />
          {t("actions.apply_all")}
        </ActionButton>
      )}
    >
      <Button variant="destructive">
        <Check className="mr-2 size-4" />
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
        description: "Tags have been merged!",
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
                  selected
                    ? "border border-blue-500 dark:border-blue-900"
                    : null,
                )}
              >
                {tag.name}
              </Link>
              <Button
                size="none"
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
          <Combine className="mr-2 size-4" />
          {t("actions.merge")}
        </ActionButton>

        <Button
          variant={"secondary"}
          onClick={() => deleteSuggestion(suggestion)}
        >
          <X className="mr-2 size-4" />
          {t("actions.ignore")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function TagSuggestionList({
  suggestions: initialSuggestions,
}: {
  suggestions: Suggestion[];
}) {
  const { suggestions, updateMergeInto, deleteSuggestion } =
    useSuggestions(initialSuggestions);

  return (
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
  );
}
