"use client";

import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

interface UserAvatarProps {
  image?: string | null;
  name?: string | null;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  fallback?: React.ReactNode;
}

const isExternalUrl = (value: string) =>
  value.startsWith("http://") || value.startsWith("https://");

export function UserAvatar({
  image,
  name,
  className,
  imgClassName,
  fallbackClassName,
  fallback,
}: UserAvatarProps) {
  const avatarUrl = useMemo(() => {
    if (!image) {
      return null;
    }
    return isExternalUrl(image) ? image : getAssetUrl(image);
  }, [image]);

  const fallbackContent = fallback ?? name?.charAt(0) ?? "U";

  return (
    <Avatar className={className}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={name ?? "User"}
          className={cn("object-cover", imgClassName)}
        />
      )}
      <AvatarFallback className={cn("text-sm font-medium", fallbackClassName)}>
        {fallbackContent}
      </AvatarFallback>
    </Avatar>
  );
}
