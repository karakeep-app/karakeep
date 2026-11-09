import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { BookOpen, ExternalLink, Globe2 } from "lucide-react";

import type { ZBookmarkedLink } from "@karakeep/shared/types/bookmarks";
import { getBookmarkLinkImageUrl } from "@karakeep/shared/utils/bookmarkUtils";

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * For images that keep their shape inside a positioned box. Sizing the element to
 * the image, rather than filling the box and letterboxing inside it, means the
 * backing only shows through transparent pixels: opaque images hide it, and a
 * white logo that would vanish on a light card sits on a tile instead.
 */
export const CONTAINED_IMAGE_CLASS =
  "absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full bg-muted-foreground/30";

/** Renders nothing once the icon fails, so no blank slot is left behind. */
function Favicon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  // An image that failed before hydration never reports it to onError.
  const checkLoaded = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);
  if (failed) {
    return null;
  }
  return (
    <Image
      ref={checkLoaded}
      src={src}
      alt=""
      width={16}
      height={16}
      unoptimized
      className="rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export default function SavedPageOverview({
  link,
  title,
  onSelectSection,
}: {
  link: ZBookmarkedLink;
  // The user's title for the bookmark, if they renamed it
  title?: string | null;
  onSelectSection: (section: string) => void;
}) {
  const { t } = useTranslation();
  const image = getBookmarkLinkImageUrl(link);
  const readerAvailable = link.readerViewStatus !== "unavailable";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-16 sm:px-8 sm:pt-20">
        <article className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
          {image ? (
            <div className="relative aspect-[16/7] max-h-72 w-full overflow-hidden border-b bg-muted/40">
              <Image
                src={image.url}
                alt=""
                width={0}
                height={0}
                unoptimized
                className={CONTAINED_IMAGE_CLASS}
              />
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center border-b bg-muted/40">
              <Globe2 className="size-8 text-muted-foreground/60" />
            </div>
          )}

          <div className="space-y-6 p-5 sm:p-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {link.favicon && <Favicon src={link.favicon} />}
                <span className="truncate">{hostname(link.url)}</span>
              </div>
              <h2 className="text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                {title || link.title || hostname(link.url)}
              </h2>
              {link.description ? (
                <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                  {link.description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-nowrap items-center gap-2">
              <Button asChild size="sm" className="max-sm:h-11 sm:hidden">
                <Link href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  {t("preview.view_original")}
                </Link>
              </Button>
              {readerAvailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="max-sm:h-11"
                  onClick={() => onSelectSection("cached")}
                >
                  <BookOpen className="size-4" />
                  {t("preview.try_reader_view")}
                </Button>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
