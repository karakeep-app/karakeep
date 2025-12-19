import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BookmarkOwnerIconProps {
  ownerName: string;
  ownerEmail: string;
  className?: string;
}

export default function BookmarkOwnerIcon({
  ownerName,
  ownerEmail,
  className = "",
}: BookmarkOwnerIconProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex aspect-square size-6 flex-col items-center justify-center rounded-full bg-primary/80 text-xs font-medium text-primary-foreground transition-all duration-200 hover:scale-110 hover:bg-primary hover:shadow-md ${className}`}
          >
            {ownerName[0]?.toUpperCase()}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{ownerName}</p>
            <p className="text-xs text-muted-foreground">{ownerEmail}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
