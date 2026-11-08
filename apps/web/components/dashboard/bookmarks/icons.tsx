import { cn } from "@/lib/utils";
import { Archive, ArchiveRestore, Check, Star } from "lucide-react";

// Icon buttons on bookmark cards: 32px, or 44px on touch and phone widths, with
// a focus ring (the ghost variant turns its ring off).
export const CARD_ICON_BUTTON_CLASS =
  "size-8 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 max-sm:size-11 [@media(pointer:coarse)]:size-11";

export const CARD_TITLE_CLASS =
  "line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis text-base font-medium leading-snug [overflow-wrap:anywhere]";

// A card's secondary text: the domain, the date and the tags.
export const CARD_META_CLASS = "text-[13px] leading-5 text-foreground/70";
export const CARD_TAG_CLASS =
  "text-nowrap text-[13px] font-normal leading-4 text-foreground/70";

/** What a card shows while selecting. The click is the card's own overlay. */
export function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 items-center justify-center rounded border-2",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/70 bg-background",
      )}
    >
      {checked && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}

export function FavouritedActionIcon({
  favourited,
  className,
  size,
  strokeWidth,
}: {
  favourited: boolean;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return favourited ? (
    <Star
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      color="#ebb434"
      fill="#ebb434"
    />
  ) : (
    <Star size={size} strokeWidth={strokeWidth} className={className} />
  );
}

export function ArchivedActionIcon({
  archived,
  className,
  size,
  strokeWidth,
}: {
  archived: boolean;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return archived ? (
    <ArchiveRestore
      size={size}
      strokeWidth={strokeWidth}
      className={className}
    />
  ) : (
    <Archive size={size} strokeWidth={strokeWidth} className={className} />
  );
}
