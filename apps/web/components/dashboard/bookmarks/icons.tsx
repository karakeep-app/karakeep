import { Archive, ArchiveRestore, Star } from "lucide-react";

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
