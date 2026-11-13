"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Images this small are logos and icons more often than not. They also have too
// few pixels to be cropped and scaled up, so they're shown whole instead.
const LOGO_MAX_NATURAL_SIZE = 600;

/**
 * A card's image, filling its parent. The size of the file isn't known until it
 * loads, but as the parent sets the dimensions the switch doesn't move anything.
 * This only ever swaps a crop for a whole image, so choosing "contain" in the
 * view options still applies to everything.
 */
export default function CardImage({
  src,
  alt,
  className,
  isScreenshot = false,
}: {
  src: string;
  alt: string;
  className?: string;
  // A page's screenshot is meant to look like the page. Other images are dimmed a
  // little in dark mode, as they can be a lot brighter than what's around them.
  isScreenshot?: boolean;
}) {
  const [isSmall, setIsSmall] = useState(false);
  return (
    <Image
      unoptimized
      fill
      alt={alt}
      src={src}
      className={cn(
        !isScreenshot && "dark:brightness-95",
        className,
        isSmall && "bg-muted object-contain p-3",
      )}
      onLoad={({ currentTarget: img }) =>
        setIsSmall(
          Math.max(img.naturalWidth, img.naturalHeight) <=
            LOGO_MAX_NATURAL_SIZE,
        )
      }
    />
  );
}
