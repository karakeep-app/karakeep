"use client";

import { ActionButton } from "@/components/ui/action-button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  useDeleteBookmark,
  useRecrawlBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { api } from "@karakeep/shared-react/trpc";

export default function BrokenLinksPage() {
  const { t } = useTranslation();

  const apiUtils = api.useUtils();
  const { data, isPending } = api.bookmarks.getBrokenLinks.useQuery();

  const { mutate: deleteBookmark, isPending: isDeleting } = useDeleteBookmark({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.deleted"),
      });
      apiUtils.bookmarks.getBrokenLinks.invalidate();
    },
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  const { mutate: recrawlBookmark, isPending: isRecrawling } =
    useRecrawlBookmark({
      onSuccess: () => {
        toast({
          description: t("toasts.bookmarks.refetch"),
        });
        apiUtils.bookmarks.getBrokenLinks.invalidate();
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center justify-between">
        <div className="mb-2 text-lg font-medium">
          {t("settings.broken_links.broken_links")}
        </div>
      </div>
      <div className="mt-2">
        {isPending && <FullPageSpinner />}
        {!isPending && data && data.bookmarks.length == 0 && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
            No broken links found
          </p>
        )}
        {!isPending && data && data.bookmarks.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.url")}</TableHead>
                <TableHead>{t("common.created_at")}</TableHead>
                <TableHead>
                  {t("settings.broken_links.last_crawled_at")}
                </TableHead>
                <TableHead>
                  {t("settings.broken_links.crawling_status")}
                </TableHead>
                <TableHead>{t("common.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bookmarks.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.url}</TableCell>
                  <TableCell>{b.createdAt?.toLocaleString()}</TableCell>
                  <TableCell>{b.crawledAt?.toLocaleString()}</TableCell>
                  <TableCell>
                    {b.isCrawlingFailure ? (
                      <span className="text-red-500">Failed</span>
                    ) : (
                      b.statusCode
                    )}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <ActionButton
                      variant="secondary"
                      loading={isRecrawling}
                      onClick={() => recrawlBookmark({ bookmarkId: b.id })}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="size-4" />
                      {t("actions.recrawl")}
                    </ActionButton>
                    <ActionButton
                      variant="destructive"
                      onClick={() => deleteBookmark({ bookmarkId: b.id })}
                      loading={isDeleting}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="size-4" />
                      {t("actions.delete")}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow></TableRow>
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
