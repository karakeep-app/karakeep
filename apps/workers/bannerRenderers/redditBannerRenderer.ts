/**
 * Reddit Banner Renderer
 *
 * Generates banner images for Reddit posts that don't have a preview image.
 * The banner includes the post title and the Reddit logo in the top-right corner.
 */

import { ImageResponse } from "@vercel/og";
import type {
  BannerRenderer,
  BannerRenderOptions,
  BannerRenderResult,
} from "./types";
import logger from "@karakeep/shared/logger";
import { fetchWithProxy } from "network";

export interface RedditBannerData {
  title: string;
  subreddit?: string;
}

const REDDIT_ORANGE = "#FF4500";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

export class RedditBannerRenderer implements BannerRenderer {
  private logoDataUrl: string | null = null;

  async render(
    data: RedditBannerData,
    options?: BannerRenderOptions,
  ): Promise<BannerRenderResult> {
    const width = options?.width ?? DEFAULT_WIDTH;
    const height = options?.height ?? DEFAULT_HEIGHT;

    try {
      // Load Reddit logo if not already loaded
      if (!this.logoDataUrl) {
        this.logoDataUrl = await this.loadRedditLogo();
      }

      // Create the image using @vercel/og
      const imageResponse = new ImageResponse(
        {
          type: "div",
          props: {
            style: {
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "60px",
              background: `linear-gradient(135deg, ${REDDIT_ORANGE} 0%, #C93400 100%)`,
              fontFamily: "Arial, sans-serif",
              position: "relative",
            },
            children: [
              // Reddit logo in top-right
              {
                type: "img",
                props: {
                  src: this.logoDataUrl,
                  style: {
                    position: "absolute",
                    top: "30px",
                    right: "30px",
                    width: "80px",
                    height: "80px",
                  },
                },
              },
              // Post title
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "56px",
                    fontWeight: "bold",
                    color: "white",
                    lineHeight: 1.3,
                    marginBottom: data.subreddit ? "20px" : "0",
                    maxWidth: "1000px",
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                  children: data.title,
                },
              },
              // Subreddit name (if available)
              data.subreddit
                ? {
                    type: "div",
                    props: {
                      style: {
                        fontSize: "32px",
                        color: "white",
                        opacity: 0.9,
                      },
                      children: data.subreddit,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        {
          width,
          height,
        },
      );

      // Convert to buffer
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        buffer,
        contentType: "image/png",
        metadata: {
          width,
          height,
          format: "png",
        },
      };
    } catch (error) {
      logger.error("[RedditBannerRenderer] Error rendering banner:", error);
      throw error;
    }
  }

  private async loadRedditLogo(): Promise<string> {
    // Reddit logo URL
    const REDDIT_LOGO_URL =
      "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png";

    try {
      const response = await fetchWithProxy(REDDIT_LOGO_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch Reddit logo: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");

      return `data:image/png;base64,${base64}`;
    } catch (error) {
      logger.warn(
        "[RedditBannerRenderer] Failed to load Reddit logo, using placeholder:",
        error,
      );

      // Create a simple SVG placeholder
      const placeholderSvg = `
        <svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
          <circle cx="96" cy="96" r="90" fill="${REDDIT_ORANGE}" />
          <text x="96" y="128" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="white" text-anchor="middle">r/</text>
        </svg>
      `;

      return `data:image/svg+xml;base64,${Buffer.from(placeholderSvg).toString("base64")}`;
    }
  }
}

export default RedditBannerRenderer;
