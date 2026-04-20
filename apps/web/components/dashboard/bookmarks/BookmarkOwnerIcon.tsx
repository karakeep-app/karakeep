import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";

interface BookmarkOwnerIconProps {
  ownerName: string;
  ownerAvatar: string | null;
}

export default function BookmarkOwnerIcon({
  ownerName,
  ownerAvatar,
}: BookmarkOwnerIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <UserAvatar
          name={ownerName}
          image={ownerAvatar}
          className="size-5 shrink-0 rounded-full ring-1 ring-border"
        />
      </TooltipTrigger>
      <TooltipContent className="font-sm">
        <p className="font-medium">{ownerName}</p>
      </TooltipContent>
    </Tooltip>
  );
}
