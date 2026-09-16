import { useMemo } from "react";
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
import { useSession } from "@/lib/auth/client";
import { useQueryState } from "nuqs";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import PdfContent from "./PdfContent";

// 20 MB
const BIG_FILE_SIZE = 20 * 1024 * 1024;

function PDFContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  const { t } = useTranslation();
  const { data: session } = useSession();

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
  const [section, setSection] = useQueryState("section", {
    defaultValue: initialSection,
  });

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
      <PdfContent
        bookmarkId={bookmark.id}
        assetId={bookmark.content.assetId}
        readOnly={session?.user?.id !== bookmark.userId}
      />
    );

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex w-full items-center justify-center gap-4">
        <Select onValueChange={setSection} value={section}>
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="screenshot" disabled={!screenshot}>
                {t("common.screenshot")}
              </SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 w-full flex-1">{content}</div>
    </div>
  );
}

function ImageContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  return (
    <div className="relative h-full min-w-full">
      <Link href={getAssetUrl(bookmark.content.assetId)} target="_blank">
        <Image
          alt="asset"
          fill={true}
          unoptimized
          className="object-contain"
          src={getAssetUrl(bookmark.content.assetId)}
        />
      </Link>
    </div>
  );
}

export function AssetContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  switch (bookmark.content.assetType) {
    case "image":
      return <ImageContentSection bookmark={bookmark} />;
    case "pdf":
      return <PDFContentSection bookmark={bookmark} />;
    default:
      return <div>Unsupported asset type</div>;
  }
}
