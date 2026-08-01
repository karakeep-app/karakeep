import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { BookOpen, ExternalLink, Globe2 } from "lucide-react";

import type { ZBookmarkedLink } from "@karakeep/shared/types/bookmarks";
import { getBookmarkLinkImageUrl } from "@karakeep/shared/utils/bookmarkUtils";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function SavedPageOverview({
  link,
  onSelectSection,
}: {
  link: ZBookmarkedLink;
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
                fill
                unoptimized
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 768px"
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
                {link.favicon ? (
                  <Image
                    src={link.favicon}
                    alt=""
                    width={16}
                    height={16}
                    unoptimized
                    className="rounded-sm"
                  />
                ) : (
                  <Globe2 className="size-4" />
                )}
                <span className="truncate">{hostname(link.url)}</span>
              </div>
              <h2 className="text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                {link.title || hostname(link.url)}
              </h2>
              {link.description ? (
                <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                  {link.description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-nowrap items-center gap-2">
              <Button asChild size="sm">
                <Link href={link.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  {t("preview.view_original")}
                </Link>
              </Button>
              {readerAvailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectSection("cached")}
                >
                  <BookOpen className="mr-2 size-4" />
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
