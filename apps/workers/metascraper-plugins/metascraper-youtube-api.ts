import type { Rules, RulesOptions } from "metascraper";
import { fetchWithProxy } from "network";
import { z } from "zod";

import logger from "@karakeep/shared/logger";
import serverConfig from "@karakeep/shared/config";

/**
 * This is a metascraper plugin to fetch YouTube video metadata
 * using the YouTube Data API v3, similar to how the Reddit plugin
 * fetches data from Reddit's JSON API.
 *
 * This plugin extracts:
 * - Title: Video title
 * - Description: Video description
 * - Image: Video thumbnail (high quality)
 * - Author: Channel name
 * - Publisher: "YouTube"
 * - Date Published: Video upload date
 * - Logo: YouTube logo
 *
 * If the YouTube API is not configured or fails, this plugin
 * will return undefined and allow other metascraper plugins
 * to extract metadata from the HTML DOM.
 */

const youtubeVideoSchema = z.object({
  snippet: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    channelTitle: z.string().optional(),
    publishedAt: z.string().optional(),
    thumbnails: z
      .object({
        maxres: z.object({ url: z.string().optional() }).optional(),
        standard: z.object({ url: z.string().optional() }).optional(),
        high: z.object({ url: z.string().optional() }).optional(),
        medium: z.object({ url: z.string().optional() }).optional(),
        default: z.object({ url: z.string().optional() }).optional(),
      })
      .optional(),
  }),
});

type YouTubeVideoData = z.infer<typeof youtubeVideoSchema>;

const youtubeResponseSchema = z.object({
  items: z.array(youtubeVideoSchema).optional(),
});

interface YouTubeFetchResult {
  fetched: boolean;
  video?: YouTubeVideoData;
}

const YOUTUBE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL (YouTube metadata changes less frequently than Reddit)

interface YouTubeCacheEntry {
  expiresAt: number;
  promise: Promise<YouTubeFetchResult>;
}

const youtubeCache = new Map<string, YouTubeCacheEntry>();

const purgeExpiredCacheEntries = (now: number) => {
  for (const [key, entry] of youtubeCache.entries()) {
    if (entry.expiresAt <= now) {
      youtubeCache.delete(key);
    }
  }
};

/**
 * Extract YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 */
const extractVideoId = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // youtu.be short URLs
    if (hostname === "youtu.be" || hostname === "www.youtu.be") {
      const videoId = urlObj.pathname.slice(1).split("/")[0];
      return videoId || null;
    }

    // youtube.com URLs
    if (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com"
    ) {
      // Check for watch?v= parameter
      const vParam = urlObj.searchParams.get("v");
      if (vParam) {
        return vParam;
      }

      // Check for /embed/, /v/, or /shorts/ in pathname
      const pathMatch = urlObj.pathname.match(
        /^\/(embed|v|shorts)\/([^/?&]+)/,
      );
      if (pathMatch && pathMatch[2]) {
        return pathMatch[2];
      }
    }

    return null;
  } catch {
    return null;
  }
};

const extractThumbnailFromVideo = (
  video: YouTubeVideoData,
): string | undefined => {
  const thumbnails = video.snippet.thumbnails;
  if (!thumbnails) {
    return undefined;
  }

  // Prefer higher quality thumbnails
  return (
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    undefined
  );
};

const extractTitleFromVideo = (video: YouTubeVideoData): string | undefined =>
  video.snippet.title?.trim() || undefined;

const extractDescriptionFromVideo = (
  video: YouTubeVideoData,
): string | undefined => video.snippet.description?.trim() || undefined;

const extractAuthorFromVideo = (video: YouTubeVideoData): string | undefined =>
  video.snippet.channelTitle?.trim() || undefined;

const extractDateFromVideo = (video: YouTubeVideoData): string | undefined => {
  if (!video.snippet.publishedAt) {
    return undefined;
  }
  const date = new Date(video.snippet.publishedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const YOUTUBE_LOGO_URL =
  "https://www.youtube.com/s/desktop/d743f786/img/favicon_144x144.png";

const fetchYouTubeVideoData = async (
  videoId: string,
): Promise<YouTubeFetchResult> => {
  const cached = youtubeCache.get(videoId);
  const now = Date.now();

  purgeExpiredCacheEntries(now);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const apiKey = serverConfig.crawler.youtubeApiKey;
    if (!apiKey) {
      logger.info(
        "[MetascraperYouTube] YouTube API key not configured, skipping API fetch",
      );
      return { fetched: false };
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "snippet");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", apiKey);

    let response;
    try {
      response = await fetchWithProxy(apiUrl.toString(), {
        headers: { accept: "application/json" },
      });
    } catch (error) {
      logger.warn(
        `[MetascraperYouTube] Failed to fetch YouTube API for video ${videoId}`,
        error,
      );
      return { fetched: false };
    }

    if (response.status === 403) {
      logger.warn(
        `[MetascraperYouTube] YouTube API forbidden (quota exceeded or invalid key) for video ${videoId}`,
      );
      return { fetched: false };
    }

    if (!response.ok) {
      logger.warn(
        `[MetascraperYouTube] YouTube API request failed for video ${videoId} with status ${response.status}`,
      );
      return { fetched: false };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      logger.warn(
        `[MetascraperYouTube] Failed to parse YouTube API JSON for video ${videoId}`,
        error,
      );
      return { fetched: false };
    }

    const parsed = youtubeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn(
        "[MetascraperYouTube] YouTube API schema validation failed",
        parsed.error,
      );
      return { fetched: false };
    }

    const video = parsed.data.items?.[0];
    if (!video) {
      logger.warn(
        `[MetascraperYouTube] No video data found for video ${videoId}`,
      );
      return { fetched: false };
    }

    return {
      fetched: true,
      video,
    };
  })();

  youtubeCache.set(videoId, {
    promise,
    expiresAt: now + YOUTUBE_CACHE_TTL_MS,
  });

  return promise;
};

const domainFromUrl = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch (error) {
    logger.error(
      "[MetascraperYouTube] domainFromUrl received an invalid URL:",
      error,
    );
    return "";
  }
};

const test = ({ url }: { url: string }): boolean => {
  const domain = domainFromUrl(url).toLowerCase();
  // Match youtube.com and youtu.be domains
  return domain === "youtube" || domain === "youtu";
};

const metascraperYouTubeApi = () => {
  const rules: Rules = {
    pkgName: "metascraper-youtube-api",
    test,
    image: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        const thumbnail = extractThumbnailFromVideo(result.video);
        if (thumbnail) {
          return thumbnail;
        }
      }

      return undefined;
    }) as unknown as RulesOptions,
    title: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return extractTitleFromVideo(result.video);
      }

      return undefined;
    }) as unknown as RulesOptions,
    description: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return extractDescriptionFromVideo(result.video);
      }

      return undefined;
    }) as unknown as RulesOptions,
    author: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return extractAuthorFromVideo(result.video);
      }

      return undefined;
    }) as unknown as RulesOptions,
    datePublished: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return extractDateFromVideo(result.video);
      }

      return undefined;
    }) as unknown as RulesOptions,
    publisher: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return "YouTube";
      }

      return undefined;
    }) as unknown as RulesOptions,
    logo: (async ({ url }: { url: string }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return undefined;
      }

      const result = await fetchYouTubeVideoData(videoId);
      if (result.video) {
        return YOUTUBE_LOGO_URL;
      }

      return undefined;
    }) as unknown as RulesOptions,
  };

  return rules;
};

export default metascraperYouTubeApi;
