/**
 * Types and interfaces for banner rendering functionality
 */

export interface BannerRenderOptions {
  width?: number;
  height?: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}

export interface BannerRenderResult {
  /**
   * The rendered image as a Buffer
   */
  buffer: Buffer;
  /**
   * The MIME type of the rendered image
   */
  contentType: string;
  /**
   * Optional metadata about the rendering
   */
  metadata?: {
    width: number;
    height: number;
    format: string;
  };
}

export interface BannerRenderer {
  /**
   * Renders a banner image based on the provided data
   */
  render(data: unknown, options?: BannerRenderOptions): Promise<BannerRenderResult>;
}
