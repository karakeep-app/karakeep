import Image from "next/image";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Camera,
  ExpandIcon,
  Video,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { ErrorBoundary } from "react-error-boundary";

import {
  BookmarkTypes,
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";

import { contentRendererRegistry } from "./content-renderers";
import ReaderView from "./ReaderView";

function CustomRendererErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Renderer Error</AlertTitle>
        <AlertDescription>
          Failed to load custom content renderer.{" "}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">
              Technical details
            </summary>
            <code className="mt-1 block text-xs">{error.message}</code>
          </details>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function FullPageArchiveSection({ link }: { link: ZBookmarkedLink }) {
  const archiveAssetId =
    link.fullPageArchiveAssetId ?? link.precrawledArchiveAssetId;
  return (
    <iframe
      sandbox=""
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
  const availableRenderers = contentRendererRegistry.getRenderers(bookmark);
  const defaultSection =
    availableRenderers.length > 0 ? availableRenderers[0].id : "cached";
  const [section, setSection] = useQueryState("section", {
    defaultValue: defaultSection,
  });

  if (bookmark.content.type != BookmarkTypes.LINK) {
    throw new Error("Invalid content type");
  }

  let content;

  // Check if current section is a custom renderer
  const customRenderer = availableRenderers.find((r) => r.id === section);
  if (customRenderer) {
    const RendererComponent = customRenderer.component;
    content = (
      <ErrorBoundary FallbackComponent={CustomRendererErrorFallback}>
        <RendererComponent bookmark={bookmark} />
      </ErrorBoundary>
    );
  } else if (section === "cached") {
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
              {/* Custom renderers first */}
              {availableRenderers.map((renderer) => {
                const IconComponent = renderer.icon;
                return (
                  <SelectItem key={renderer.id} value={renderer.id}>
                    <div className="flex items-center">
                      <IconComponent className="mr-2 h-4 w-4" />
                      {renderer.name}
                    </div>
                  </SelectItem>
                );
              })}

              {/* Default renderers */}
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
