import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { IconTooltip } from "./IconControl";
import { CONTAINED_IMAGE_CLASS } from "./SavedPageOverview";
import UnavailableViewOption from "./UnavailableViewOption";

// 20 MB
const BIG_FILE_SIZE = 20 * 1024 * 1024;

function PDFContentSection({
  bookmark,
  toolbarSlot,
}: {
  bookmark: ZBookmark;
  toolbarSlot?: HTMLElement | null;
}) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  const { t } = useTranslation();

  const initialSection = useMemo(() => {
    if (bookmark.content.type != BookmarkTypes.ASSET) {
      throw new Error("Invalid content type");
    }

    const screenshot = bookmark.assets.find(
      (item) => item.assetType === "assetScreenshot",
    );
    const bigSize =
      bookmark.content.size && bookmark.content.size > BIG_FILE_SIZE;
    if (bigSize && screenshot) {
      return "screenshot";
    }
    return "pdf";
  }, [bookmark]);
  const [section, setSection] = useState(initialSection);

  const screenshot = bookmark.assets.find(
    (r) => r.assetType === "assetScreenshot",
  )?.id;

  const content =
    section === "screenshot" && screenshot ? (
      <div className="relative h-full min-w-full">
        <Image
          alt="screenshot"
          src={getAssetUrl(screenshot)}
          fill={true}
          unoptimized
          className="object-contain"
        />
      </div>
    ) : (
      <embed
        title={bookmark.content.assetId}
        type="application/pdf"
        className="h-full w-full"
        src={getAssetUrl(bookmark.content.assetId)}
      />
    );

  const viewSelect = (
    <Select onValueChange={setSection} value={section}>
      <IconTooltip label={t("preview.change_view")} side="bottom">
        <SelectTrigger
          aria-label={t("preview.change_view")}
          className="h-8 w-fit max-sm:h-11 [&_[data-view-reason]]:hidden [@media(pointer:coarse)]:h-11"
        >
          <SelectValue />
        </SelectTrigger>
      </IconTooltip>
      <SelectContent>
        <SelectGroup>
          {screenshot ? (
            <SelectItem value="screenshot">{t("common.screenshot")}</SelectItem>
          ) : (
            <UnavailableViewOption
              value="screenshot"
              label={t("common.screenshot")}
              reason={t("preview.unavailable_view.no_screenshot")}
            />
          )}
          <SelectItem value="pdf">PDF</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex h-full flex-col items-center gap-2">
      {toolbarSlot ? (
        createPortal(viewSelect, toolbarSlot)
      ) : (
        <div className="flex w-full items-center justify-center gap-4">
          {viewSelect}
        </div>
      )}
      {content}
    </div>
  );
}

function ImageContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  return (
    <div className="relative h-full min-w-full">
      <Link
        href={getAssetUrl(bookmark.content.assetId)}
        target="_blank"
        className="absolute inset-0"
      >
        <Image
          alt="asset"
          width={0}
          height={0}
          unoptimized
          className={CONTAINED_IMAGE_CLASS}
          src={getAssetUrl(bookmark.content.assetId)}
        />
      </Link>
    </div>
  );
}

export function AssetContentSection({
  bookmark,
  toolbarSlot,
}: {
  bookmark: ZBookmark;
  /** Where the view controls go. Without one, they take a row of their own. */
  toolbarSlot?: HTMLElement | null;
}) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  switch (bookmark.content.assetType) {
    case "image":
      return <ImageContentSection bookmark={bookmark} />;
    case "pdf":
      return (
        <PDFContentSection bookmark={bookmark} toolbarSlot={toolbarSlot} />
      );
    default:
      return <div>Unsupported asset type</div>;
  }
}
