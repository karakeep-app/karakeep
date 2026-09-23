"use client";

import { useState } from "react";
import { CopyBtnV2 } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "react-i18next";

import {
  useBookmarkLists,
  useEditBookmarkList,
} from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function PublicListLink({ list }: { list: ZBookmarkList }) {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();

  const { mutate: editList, isPending: isLoading } = useEditBookmarkList();
  const [applyToChildren, setApplyToChildren] = useState(false);
  const { data: allLists } = useBookmarkLists();
  // Paths ending below this list are exactly its descendants.
  const numDescendants =
    allLists?.allPaths.filter((path) =>
      path.slice(0, -1).some((l) => l.id === list.id),
    ).length ?? 0;

  const publicListUrl = `${clientConfig.publicUrl}/public/lists/${list.id}`;
  const isPublic = list.public;

  return (
    <>
      {/* Public List Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="public-toggle" className="text-sm font-medium">
            {t("lists.public_list.title")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("lists.public_list.description")}
          </p>
        </div>
        <Switch
          id="public-toggle"
          checked={isPublic}
          disabled={isLoading || !!clientConfig.demoMode}
          onCheckedChange={(checked) => {
            editList({
              listId: list.id,
              public: checked,
              applyPublicToChildren: numDescendants > 0 && applyToChildren,
            });
          }}
        />
      </div>

      {numDescendants > 0 && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label
              htmlFor="public-apply-to-children"
              className="text-sm font-medium"
            >
              {t("lists.public_list.apply_to_children", {
                count: numDescendants,
              })}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("lists.public_list.apply_to_children_description")}
            </p>
          </div>
          <Switch
            id="public-apply-to-children"
            checked={applyToChildren}
            disabled={isLoading || !!clientConfig.demoMode}
            onCheckedChange={setApplyToChildren}
          />
        </div>
      )}

      {/* Share URL - only show when public */}
      {isPublic && (
        <>
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {t("lists.public_list.share_link")}
            </Label>
            <div className="flex items-center space-x-2">
              <Input
                value={publicListUrl}
                readOnly
                className="flex-1 text-sm"
              />
              <CopyBtnV2 getStringToCopy={() => publicListUrl} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
