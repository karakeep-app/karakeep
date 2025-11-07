import { ShoppingCart } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractAmazonProductInfo(
  url: string,
): { asin: string; domain: string } | null {
  const patterns = [
    // Standard product URLs
    /amazon\.([a-z.]+)\/.*\/dp\/([A-Z0-9]{10})/,
    /amazon\.([a-z.]+)\/dp\/([A-Z0-9]{10})/,
    // Shortened URLs
    /amazon\.([a-z.]+)\/gp\/product\/([A-Z0-9]{10})/,
    // Mobile URLs
    /amazon\.([a-z.]+)\/.*\/product\/([A-Z0-9]{10})/,
    // International variations
    /amazon\.([a-z.]+)\/.*\/([A-Z0-9]{10})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        domain: match[1],
        asin: match[2],
      };
    }
  }
  return null;
}

function canRenderAmazon(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }

  const url = bookmark.content.url;
  return extractAmazonProductInfo(url) !== null;
}

function AmazonRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const productInfo = extractAmazonProductInfo(bookmark.content.url);
  if (!productInfo) {
    return null;
  }

  const { title, description, imageUrl } = bookmark.content;

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col items-center p-6">
        {/* Product Image */}
        {imageUrl && (
          <div className="mb-6 w-full max-w-md">
            {/* oxlint-disable-next-line no-img-element */}
            <img
              src={imageUrl}
              alt={title || "Amazon Product"}
              className="h-auto max-h-96 w-full rounded-lg object-contain shadow-lg"
            />
          </div>
        )}

        {/* Product Info Card */}
        <div className="w-full rounded-lg border bg-card p-6 shadow-sm">
          {/* Title */}
          {title && (
            <h2 className="mb-4 line-clamp-3 text-xl font-semibold">{title}</h2>
          )}

          {/* Description */}
          {description && (
            <p className="mb-6 line-clamp-4 text-muted-foreground">
              {description}
            </p>
          )}

          {/* Product Details */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">ASIN:</span>
              <span className="font-mono text-muted-foreground">
                {productInfo.asin}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Domain:</span>
              <span className="text-muted-foreground">
                amazon.{productInfo.domain}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {/* oxlint-disable-next-line no-html-link-for-pages */}
            <a
              href={bookmark.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#FF9900] px-4 py-2 text-center font-medium text-white transition-colors hover:bg-[#FF9900]/90"
            >
              <ShoppingCart size={16} />
              View on Amazon
            </a>
            {/* oxlint-disable-next-line no-html-link-for-pages */}
            <a
              href={`https://www.amazon.${productInfo.domain}/dp/${productInfo.asin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
            >
              Direct Link
            </a>
          </div>

          {/* Amazon Disclaimer */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Product information from Amazon. Prices and availability may vary.
          </p>
        </div>
      </div>
    </div>
  );
}

export const amazonRenderer: ContentRenderer = {
  id: "amazon",
  name: "Amazon Product",
  icon: ShoppingCart,
  canRender: canRenderAmazon,
  component: AmazonRendererComponent,
  priority: 10,
};
