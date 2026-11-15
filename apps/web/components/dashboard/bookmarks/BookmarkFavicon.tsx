import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

export default function BookmarkFavicon({
  src,
  domain,
  className,
}: {
  src?: string | null;
  // Its first letter stands in for a favicon that's missing
  domain?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    if (domain) {
      return (
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[11px] font-medium uppercase leading-none text-muted-foreground ring-1 ring-border",
            className,
          )}
        >
          {domain.charAt(0)}
        </span>
      );
    }
    return (
      <Globe
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={16}
      height={16}
      unoptimized
      // A mid-tone chip, which neither a white nor a black icon can vanish on, in
      // either theme. The ring grows it without moving anything.
      className={cn(
        "size-4 shrink-0 rounded-sm bg-muted-foreground/40 ring-1 ring-border",
        className,
      )}
      onError={() => setFailed(true)}
      // A 1x1 pixel is how some sites and proxies say they have no icon
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 1) {
          setFailed(true);
        }
      }}
    />
  );
}
