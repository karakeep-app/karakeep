import { Archive, ArchiveRestore, Star } from "lucide-react";

export function FavouritedActionIcon({
  favourited,
  className,
  size,
}: {
  favourited: boolean;
  className?: string;
  size?: number;
}) {
  return favourited ? (
    <Star size={size} className={className} color="#ebb434" fill="#ebb434" />
  ) : (
    <Star size={size} className={className} />
  );
}

export function ArchivedActionIcon({
  archived,
  className,
  size,
}: {
  archived: boolean;
  className?: string;
  size?: number;
}) {
  return archived ? (
    <ArchiveRestore size={size} className={className} />
  ) : (
    <Archive size={size} className={className} />
  );
}
