import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Archive, BookOpen, Camera, ExpandIcon, Video } from "lucide-react";

import {
  BookmarkTypes,
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";

import ReaderView from "./ReaderView";

function FullPageArchiveSection({ link }: { link: ZBookmarkedLink }) {
  const archiveAssetId =
    link.fullPageArchiveAssetId ?? link.precrawledArchiveAssetId;
  return (
    <iframe
      title={link.url}
      src={`/api/assets/${archiveAssetId}`}
      className="relative h-full min-w-full"
    />
  );
}

function ScreenshotSection({ link }: { link: ZBookmarkedLink }) {
  return (
    <div className="relative h-full min-w-full">
      <Image
        alt="screenshot"
        src={`/api/assets/${link.screenshotAssetId}`}
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}

function VideoSection({ link }: { link: ZBookmarkedLink }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 h-full w-full">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions not (yet) available */}
        <video className="m-auto max-h-full max-w-full" controls>
          <source src={`/api/assets/${link.videoAssetId}`} />
          Not supported by your browser
        </video>
      </div>
    </div>
  );
}

export default function LinkContentSection({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<string>("cached");

  if (bookmark.content.type != BookmarkTypes.LINK) {
    throw new Error("Invalid content type");
  }

  let content;
  if (section === "cached") {
    content = (
      <ScrollArea className="h-full">
        <ReaderView
          className="prose mx-auto dark:prose-invert"
          bookmarkId={bookmark.id}
        />
      </ScrollArea>
    );
  } else if (section === "archive") {
    content = <FullPageArchiveSection link={bookmark.content} />;
  } else if (section === "video") {
    content = <VideoSection link={bookmark.content} />;
  } else {
    content = <ScreenshotSection link={bookmark.content} />;
  }

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <Select onValueChange={setSection} value={section}>
          <SelectTrigger className="w-fit">
            <span className="mr-2">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="cached">
                <div className="flex items-center">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t("preview.reader_view")}
                </div>
              </SelectItem>
              <SelectItem
                value="screenshot"
                disabled={!bookmark.content.screenshotAssetId}
              >
                <div className="flex items-center">
                  <Camera className="mr-2 h-4 w-4" />
                  {t("common.screenshot")}
                </div>
              </SelectItem>
              <SelectItem
                value="archive"
                disabled={
                  !bookmark.content.fullPageArchiveAssetId &&
                  !bookmark.content.precrawledArchiveAssetId
                }
              >
                <div className="flex items-center">
                  <Archive className="mr-2 h-4 w-4" />
                  {t("common.archive")}
                </div>
              </SelectItem>
              <SelectItem
                value="video"
                disabled={!bookmark.content.videoAssetId}
              >
                <div className="flex items-center">
                  <Video className="mr-2 h-4 w-4" />
                  {t("common.video")}
                </div>
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {section === "cached" && (
          <Tooltip>
            <TooltipTrigger>
              <Link
                href={`/reader/${bookmark.id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                <ExpandIcon className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">FullScreen</TooltipContent>
          </Tooltip>
        )}
      </div>
      {content}
    </div>
  );
}
