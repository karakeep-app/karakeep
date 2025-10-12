"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import LoadingSpinner from "@/components/ui/spinner";
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
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Undo2 } from "lucide-react";

export function IgnoredTagPairs() {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  const { data: ignoredPairs, isLoading } = api.tags.listIgnoredPairs.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
    },
  );

  const utils = api.useUtils();

  const { mutate: unignorePair } = api.tags.unignorePair.useMutation({
    onSuccess: () => {
      toast({
        description: "Tag pair unignored",
      });
      utils.tags.listIgnoredPairs.invalidate();
      utils.tags.getIgnoredPairIds.invalidate();
    },
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const pairs = ignoredPairs?.ignoredPairs ?? [];

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      You have {pairs.length} ignored tag pair{pairs.length !== 1 ? "s" : ""}.
      {pairs.length > 0 && (
        <CollapsibleTrigger asChild>
          <Button variant="link" size="sm">
            {expanded ? "Hide All" : "Show All"}
          </Button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        {pairs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag Pairs</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={pair.id}>
                  <TableCell className="flex flex-wrap gap-1">
                    <Link
                      href={`/dashboard/tags/${pair.tag1.id}`}
                      className={cn(
                        badgeVariants({ variant: "outline" }),
                        "text-sm",
                      )}
                    >
                      {pair.tag1.name}
                    </Link>
                    <span className="text-muted-foreground">&</span>
                    <Link
                      href={`/dashboard/tags/${pair.tag2.id}`}
                      className={cn(
                        badgeVariants({ variant: "outline" }),
                        "text-sm",
                      )}
                    >
                      {pair.tag2.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <ActionButton
                      variant="secondary"
                      onClick={() => unignorePair({ pairId: pair.id })}
                    >
                      <Undo2 className="mr-2 size-4" />
                      {t("actions.unignore")}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
