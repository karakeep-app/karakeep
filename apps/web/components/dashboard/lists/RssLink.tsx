"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CopyBtnV2 } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { useTRPC } from "@/lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RssLink({ listId }: { listId: string }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const queryClient = useQueryClient();

  const { mutate: regenRssToken, isPending: isRegenPending } = useMutation(
    api.lists.regenRssToken.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.lists.getRssToken.queryFilter({ listId }),
        );
      },
    }),
  );
  const { mutate: clearRssToken, isPending: isClearPending } = useMutation(
    api.lists.clearRssToken.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.lists.getRssToken.queryFilter({ listId }),
        );
      },
    }),
  );
  const { data: rssToken, isLoading: isTokenLoading } = useQuery(
    api.lists.getRssToken.queryOptions({ listId }),
  );

  const rssUrl = useMemo(() => {
    if (!rssToken || !rssToken.token) {
      return null;
    }
    return `${clientConfig.publicApiUrl}/v1/rss/lists/${listId}?token=${rssToken.token}`;
  }, [rssToken]);

  const rssEnabled = rssUrl !== null;

  return (
    <>
      {/* RSS Feed Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="rss-toggle" className="text-sm font-medium">
            {t("lists.rss.title")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("lists.rss.description")}
          </p>
        </div>
        <Switch
          id="rss-toggle"
          checked={rssEnabled}
          onCheckedChange={(checked) =>
            checked ? regenRssToken({ listId }) : clearRssToken({ listId })
          }
          disabled={
            isTokenLoading ||
            isClearPending ||
            isRegenPending ||
            !!clientConfig.demoMode
          }
        />
      </div>
      {/* RSS URL - only show when RSS is enabled */}
      {rssEnabled && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t("lists.rss.feed_url")}
          </Label>
          <div className="flex items-center space-x-2">
            <Input value={rssUrl} readOnly className="flex-1 text-sm" />
            <CopyBtnV2 getStringToCopy={() => rssUrl} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenRssToken({ listId })}
              disabled={isRegenPending}
            >
              {isRegenPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
