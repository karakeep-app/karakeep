/**
 * Reddit Banner Renderer
 *
 * Generates banner images for Reddit posts that don't have a preview image.
 * The banner includes the post title and the Reddit logo in the top-right corner.
 */

import sharp from "sharp";
import type { BannerRenderer, BannerRenderOptions, BannerRenderResult } from "./types";
import logger from "@karakeep/shared/logger";

export interface RedditBannerData {
  title: string;
  subreddit?: string;
}

const REDDIT_ORANGE = "#FF4500";
const REDDIT_BLUE = "#0079D3";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;
const LOGO_SIZE = 80;
const LOGO_MARGIN = 30;

/**
 * Wraps text to fit within a specified width
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Limit to maximum 4 lines
  return lines.slice(0, 4);
}

export class RedditBannerRenderer implements BannerRenderer {
  private logoBuffer: Buffer | null = null;

  async render(
    data: RedditBannerData,
    options?: BannerRenderOptions
  ): Promise<BannerRenderResult> {
    const width = options?.width ?? DEFAULT_WIDTH;
    const height = options?.height ?? DEFAULT_HEIGHT;
    const format = options?.format ?? "png";
    const quality = options?.quality ?? 90;

    try {
      // Create gradient background
      const background = await this.createGradientBackground(width, height);

      // Load Reddit logo if not already loaded
      if (!this.logoBuffer) {
        this.logoBuffer = await this.loadRedditLogo();
      }

      // Prepare logo overlay
      const logoImage = await sharp(this.logoBuffer)
        .resize(LOGO_SIZE, LOGO_SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      // Prepare text overlay
      const textSvg = this.createTextSvg(data, width, height);

      // Composite all layers
      const composite = sharp(background)
        .composite([
          {
            input: Buffer.from(textSvg),
            top: 0,
            left: 0,
          },
          {
            input: logoImage,
            top: LOGO_MARGIN,
            left: width - LOGO_SIZE - LOGO_MARGIN,
          },
        ]);

      // Convert to final format
      let outputBuffer: Buffer;
      let contentType: string;

      if (format === "jpeg") {
        outputBuffer = await composite.jpeg({ quality }).toBuffer();
        contentType = "image/jpeg";
      } else if (format === "webp") {
        outputBuffer = await composite.webp({ quality }).toBuffer();
        contentType = "image/webp";
      } else {
        outputBuffer = await composite.png({ quality }).toBuffer();
        contentType = "image/png";
      }

      return {
        buffer: outputBuffer,
        contentType,
        metadata: {
          width,
          height,
          format,
        },
      };
    } catch (error) {
      logger.error("[RedditBannerRenderer] Error rendering banner:", error);
      throw error;
    }
  }

  private async createGradientBackground(
    width: number,
    height: number
  ): Promise<Buffer> {
    // Create a simple gradient from Reddit orange to a darker orange
    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${REDDIT_ORANGE};stop-opacity:1" />
            <stop offset="100%" style="stop-color:#C93400;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad)" />
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private createTextSvg(
    data: RedditBannerData,
    width: number,
    height: number
  ): string {
    // Wrap text to fit within the banner (accounting for margins and logo)
    const maxCharsPerLine = Math.floor((width - LOGO_SIZE - LOGO_MARGIN * 3) / 15);
    const titleLines = wrapText(data.title, maxCharsPerLine);

    const fontSize = 56;
    const lineHeight = 72;
    const totalTextHeight = titleLines.length * lineHeight;
    const startY = (height - totalTextHeight) / 2 + fontSize;

    const textElements = titleLines
      .map((line, index) => {
        const y = startY + index * lineHeight;
        // Escape XML special characters
        const escapedLine = line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");

        return `<text x="60" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${escapedLine}</text>`;
      })
      .join("\n      ");

    let subredditElement = "";
    if (data.subreddit) {
      const subredditY = startY + titleLines.length * lineHeight + 40;
      const escapedSubreddit = data.subreddit
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      subredditElement = `<text x="60" y="${subredditY}" font-family="Arial, sans-serif" font-size="32" fill="white" opacity="0.9">${escapedSubreddit}</text>`;
    }

    return `
      <svg width="${width}" height="${height}">
        ${textElements}
        ${subredditElement}
      </svg>
    `;
  }

  private async loadRedditLogo(): Promise<Buffer> {
    // Reddit logo URL from the metascraper plugin
    const REDDIT_LOGO_URL =
      "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png";

    try {
      const { fetchWithProxy } = await import("network");
      const response = await fetchWithProxy(REDDIT_LOGO_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch Reddit logo: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.warn(
        "[RedditBannerRenderer] Failed to load Reddit logo, using placeholder:",
        error
      );

      // Create a simple circular placeholder logo
      const placeholderSvg = `
        <svg width="192" height="192">
          <circle cx="96" cy="96" r="90" fill="${REDDIT_ORANGE}" />
          <text x="96" y="120" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="white" text-anchor="middle">r/</text>
        </svg>
      `;

      return sharp(Buffer.from(placeholderSvg)).png().toBuffer();
    }
  }
}

export default RedditBannerRenderer;
