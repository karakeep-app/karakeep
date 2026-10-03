"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { Captions, Play } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getYouTubeVideoId } from "@karakeep/shared/youtubeTranscript";

interface Segment {
  startMs: number;
  text: string;
}
interface Transcript {
  language: string;
  source: string;
  segments: Segment[];
}
interface YouTubePlayer {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

let youtubeIframeApiPromise: Promise<void> | undefined;

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  youtubeIframeApiPromise ??= new Promise<void>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const createdScript = !script;
    script ??= document.createElement("script");
    const apiScript = script;
    let timeout: number;
    const cleanup = () => {
      window.clearTimeout(timeout);
      apiScript.removeEventListener("error", onError);
      if (window.onYouTubeIframeAPIReady === onReady) {
        window.onYouTubeIframeAPIReady = previousCallback;
      }
    };
    const onReady = () => {
      cleanup();
      resolve();
      previousCallback?.();
    };
    const onError = () => {
      cleanup();
      apiScript.remove();
      youtubeIframeApiPromise = undefined;
      reject(new Error("Failed to load the YouTube IFrame API"));
    };
    window.onYouTubeIframeAPIReady = onReady;
    apiScript.addEventListener("error", onError, { once: true });
    timeout = window.setTimeout(onError, 15_000);
    if (createdScript) {
      apiScript.src = "https://www.youtube.com/iframe_api";
      apiScript.async = true;
      document.head.appendChild(apiScript);
    }
  });
  return youtubeIframeApiPromise;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width: string;
          height: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onError?: () => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function readTranscripts(html: string): Transcript[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.querySelectorAll("section.youtube-transcript"))
    .map((section) => {
      const language = section.getAttribute("data-transcript-language");
      if (!language) return null;
      const segments = Array.from(
        section.querySelectorAll<HTMLElement>(
          ".youtube-transcript-segment[data-start-ms]",
        ),
      ).flatMap((element) => {
        const startMs = Number(element.dataset.startMs);
        const timestamp = element.querySelector(
          ".youtube-transcript-timestamp",
        );
        const text = Array.from(element.childNodes)
          .filter((node) => node !== timestamp)
          .map((node) => node.textContent ?? "")
          .join("")
          .trim();
        return Number.isFinite(startMs) && text ? [{ startMs, text }] : [];
      });
      return {
        language,
        source: section.getAttribute("data-transcript-source") ?? "",
        segments,
      };
    })
    .filter(
      (transcript): transcript is Transcript =>
        !!transcript && transcript.segments.length > 0,
    );
}

function formatTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function findActiveSegmentIndex(segments: Segment[], currentTimeMs: number) {
  let low = 0;
  let high = segments.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (segments[middle]!.startMs <= currentTimeMs) {
      active = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return active;
}

export default function YoutubeTranscriptView({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const segmentRefs = useRef(new Map<number, HTMLButtonElement>());
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const { data, isPending } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId: bookmark.id,
      includeContent: true,
    }),
  );
  const html =
    data?.content.type === BookmarkTypes.LINK
      ? (data.content.htmlContent ?? "")
      : "";
  const transcripts = useMemo(() => readTranscripts(html), [html]);
  const activeLanguage = transcripts.some(
    (item) => item.language === selectedLanguage,
  )
    ? selectedLanguage!
    : (transcripts[0]?.language ?? "");
  const transcript = transcripts.find(
    (item) => item.language === activeLanguage,
  );
  const videoId =
    bookmark.content.type === BookmarkTypes.LINK
      ? getYouTubeVideoId(bookmark.content.url)
      : null;

  useEffect(() => {
    if (isPending || !videoId || !playerHostRef.current) return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let readyTimeout: number | undefined;
    setPlayerReady(false);
    setPlayerError(false);
    const createPlayer = () => {
      if (cancelled || !window.YT?.Player || !playerHostRef.current) return;
      readyTimeout = window.setTimeout(() => {
        if (!cancelled) setPlayerError(true);
      }, 15_000);
      try {
        player = new window.YT.Player(playerHostRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            enablejsapi: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              window.clearTimeout(readyTimeout);
              if (cancelled) {
                target.destroy();
                return;
              }
              playerRef.current = target;
              setPlayerError(false);
              setPlayerReady(true);
            },
            onError: () => {
              window.clearTimeout(readyTimeout);
              if (!cancelled) {
                setPlayerReady(false);
                setPlayerError(true);
              }
            },
          },
        });
      } catch {
        window.clearTimeout(readyTimeout);
        if (!cancelled) setPlayerError(true);
      }
    };

    void loadYouTubeIframeApi().then(createPlayer, () => {
      if (!cancelled) setPlayerError(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimeout);
      player?.destroy();
      playerRef.current = null;
    };
  }, [isPending, videoId]);

  useEffect(() => {
    if (!playerReady || !transcript) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const nextIndex = findActiveSegmentIndex(
          transcript.segments,
          player.getCurrentTime() * 1000,
        );
        setActiveSegmentIndex((previous) =>
          previous === nextIndex ? previous : nextIndex,
        );
      } catch {
        // The IFrame API can briefly reject calls while the player changes state.
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [playerReady, transcript]);

  useEffect(() => {
    if (activeSegmentIndex >= 0) {
      segmentRefs.current
        .get(activeSegmentIndex)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeSegmentIndex]);

  const seekTo = useCallback((startMs: number) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(startMs / 1000, true);
    playerRef.current.playVideo();
  }, []);

  if (isPending) {
    return (
      <div className="grid h-full gap-4 p-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-full min-h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)] lg:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black shadow-sm">
          <div ref={playerHostRef} className="absolute inset-0 h-full w-full" />
          {(playerError || !videoId) && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">
              {t("preview.youtube_transcript.player_unavailable")}
            </div>
          )}
          {!playerReady && !playerError && videoId && (
            <div className="absolute inset-0 animate-pulse bg-muted/20" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Play className="h-3 w-3" />
            {t("preview.youtube_transcript.player")}
          </Badge>
          {transcripts.map((item) => (
            <Badge key={item.language} variant="outline">
              {item.language.toUpperCase()} · {item.source}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex min-h-64 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm lg:min-h-0">
        <div className="border-b px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {t("preview.youtube_transcript.title")}
            </h2>
            {transcript && (
              <Badge variant="secondary">{transcript.segments.length}</Badge>
            )}
          </div>
          {transcripts.length > 1 && (
            <div
              className="flex gap-1"
              aria-label={t("preview.youtube_transcript.languages")}
            >
              {transcripts.map((item) => (
                <Button
                  key={item.language}
                  type="button"
                  size="sm"
                  variant={
                    item.language === activeLanguage ? "secondary" : "ghost"
                  }
                  onClick={() => {
                    setSelectedLanguage(item.language);
                    setActiveSegmentIndex(-1);
                  }}
                  aria-pressed={item.language === activeLanguage}
                >
                  {item.language.toUpperCase()}
                </Button>
              ))}
            </div>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {transcripts.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-muted p-3">
                <Captions className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium">
                  {t("preview.youtube_transcript.empty_title")}
                </h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t("preview.youtube_transcript.empty_description")}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {transcript?.segments.map((segment, index) => (
                <button
                  key={`${segment.startMs}-${index}`}
                  ref={(element) => {
                    if (element) segmentRefs.current.set(index, element);
                    else segmentRefs.current.delete(index);
                  }}
                  type="button"
                  onClick={() => seekTo(segment.startMs)}
                  className={`group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === activeSegmentIndex ? "bg-accent text-accent-foreground" : "text-foreground"}`}
                  aria-current={
                    index === activeSegmentIndex ? "time" : undefined
                  }
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground group-hover:text-foreground">
                    {formatTimestamp(segment.startMs)}
                  </span>
                  <span className="leading-relaxed">{segment.text}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
