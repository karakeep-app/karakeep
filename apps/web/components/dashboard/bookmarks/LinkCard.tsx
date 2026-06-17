"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

import type { ZBookmarkTypeLink } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import FooterLinkURL from "./FooterLinkURL";

const useOnClickUrl = (bookmark: ZBookmarkTypeLink) => {
  const userSettings = useUserSettings();
  return {
    urlTarget:
      userSettings.bookmarkClickAction === "open_original_link"
        ? ("_blank" as const)
        : ("_self" as const),
    onClickUrl:
      userSettings.bookmarkClickAction === "expand_bookmark_preview"
        ? `/dashboard/preview/${bookmark.id}`
        : bookmark.content.url,
  };
};

function LinkTitle({ bookmark }: { bookmark: ZBookmarkTypeLink }) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const parsedUrl = new URL(bookmark.content.url);
  return (
    <Link href={onClickUrl} target={urlTarget} rel="noreferrer">
      {getBookmarkTitle(bookmark) ?? parsedUrl.host}
    </Link>
  );
}

function getYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function isVideoUrl(url: string): boolean {
  return !!(getYouTubeId(url) || getVimeoId(url));
}

/**
 * Plays videos inline on the bookmark card:
 * - self-hosted videos archived by yt-dlp (videoAssetId) via a native <video>
 *   player (the asset route supports range requests, so seeking works);
 * - YouTube / Vimeo links via their privacy-friendly embeds, shown as a poster
 *   with a play button until the user clicks (so we don't mount an iframe per
 *   card up front).
 *
 * It fills whatever container the active layout provides (passed as className).
 */
function VideoEmbed({
  url,
  title,
  videoAssetId,
  posterUrl,
  className,
}: {
  url: string;
  title?: string | null;
  videoAssetId?: string | null;
  posterUrl?: string | null;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const youTubeId = videoAssetId ? null : getYouTubeId(url);
  const vimeoId = videoAssetId || youTubeId ? null : getVimeoId(url);

  let inner: React.ReactNode = null;
  if (videoAssetId) {
    inner = (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- captions not (yet) available
      <video
        controls
        preload="metadata"
        playsInline
        poster={posterUrl ?? undefined}
        className="absolute inset-0 h-full w-full object-contain"
      >
        <source src={`/api/assets/${videoAssetId}`} />
      </video>
    );
  } else if (youTubeId || vimeoId) {
    const embedSrc = youTubeId
      ? `https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1&rel=0`
      : `https://player.vimeo.com/video/${vimeoId}?autoplay=1`;
    // YouTube has a public thumbnail CDN; Vimeo doesn't, so fall back to the
    // bookmark's crawled image for the pre-play poster.
    const posterImage = youTubeId
      ? `https://i.ytimg.com/vi/${youTubeId}/hqdefault.jpg`
      : (posterUrl ?? null);
    inner = playing ? (
      <iframe
        src={embedSrc}
        title={title ?? "video"}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        allowFullScreen
      />
    ) : (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPlaying(true);
        }}
        className="group/play absolute inset-0 h-full w-full"
        aria-label="Play video"
      >
        {posterImage && (
          <Image
            src={posterImage}
            alt={title ?? "video thumbnail"}
            fill
            unoptimized
            className="object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover/play:bg-black/25">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition group-hover/play:scale-110 group-hover/play:bg-black/75">
            <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
          </span>
        </span>
      </button>
    );
  } else {
    return null;
  }

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      {inner}
    </div>
  );
}

function LinkImage({
  bookmark,
  className,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
}) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const link = bookmark.content;

  const imgComponent = (url: string, unoptimized: boolean) => (
    <Image
      unoptimized={unoptimized}
      className={className}
      alt="card banner"
      fill={true}
      src={url}
    />
  );

  const imageDetails = getBookmarkLinkImageUrl(link);

  let img: React.ReactNode;
  if (isBookmarkStillCrawling(bookmark)) {
    img = imgComponent("/blur.avif", false);
  } else if (imageDetails) {
    img = imgComponent(imageDetails.url, true);
  } else {
    // No image found
    // A dummy white pixel for when there's no image.
    img = imgComponent(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj+P///38ACfsD/QVDRcoAAAAASUVORK5CYII=",
      true,
    );
  }

  return (
    <Link
      href={onClickUrl}
      target={urlTarget}
      rel="noreferrer"
      className={className}
    >
      <div className="relative size-full flex-1">{img}</div>
    </Link>
  );
}

export default function LinkCard({
  bookmark: bookmarkLink,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
  bookmarkIndex?: number;
}) {
  const link = bookmarkLink.content;
  const videoAssetId = link.videoAssetId;
  const isVideo = !!videoAssetId || isVideoUrl(link.url);
  return (
    <BookmarkLayoutAdaptingCard
      title={<LinkTitle bookmark={bookmarkLink} />}
      footer={<FooterLinkURL url={getSourceUrl(bookmarkLink)} />}
      bookmark={bookmarkLink}
      wrapTags={false}
      image={(_layout, className) =>
        isVideo ? (
          <VideoEmbed
            url={link.url}
            title={getBookmarkTitle(bookmarkLink)}
            videoAssetId={videoAssetId}
            posterUrl={getBookmarkLinkImageUrl(link)?.url ?? null}
            className={className}
          />
        ) : (
          <LinkImage className={className} bookmark={bookmarkLink} />
        )
      }
      className={className}
      bookmarkIndex={bookmarkIndex}
    />
  );
}
