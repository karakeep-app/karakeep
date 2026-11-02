import React, { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useDragAndDrop } from "@/lib/drag-and-drop";
import { X } from "lucide-react";
import Draggable from "react-draggable";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";

export const TagPill = React.memo(function TagPill({
  id,
  name,
  count,
  isDraggable,
  onOpenDialog,
}: {
  id: string;
  name: string;
  count: number;
  isDraggable: boolean;
  onOpenDialog: (tag: { id: string; name: string }) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const draggableRef = useRef<HTMLDivElement>(null);

  const handleMouseOver = () => setIsHovered(true);
  const handleMouseOut = () => setIsHovered(false);

  const { mutate: mergeTag } = useMergeTag({
    onSuccess: () => {
      toast({
        description: "Tags have been merged!",
      });
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Something went wrong",
        });
      }
    },
  });

  const dragAndDropFunction = useDragAndDrop(
    "data-id",
    (dragTargetId: string) => {
      mergeTag({
        fromTagIds: [id],
        intoTagId: dragTargetId,
      });
    },
  );

  const pill = (
    <div
      className="group relative flex"
      onMouseOver={handleMouseOver}
      onFocus={handleMouseOver}
      onMouseOut={handleMouseOut}
      onBlur={handleMouseOut}
      ref={draggableRef}
    >
      <Link
        className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 py-1 pl-3 pr-1 text-sm font-medium text-foreground transition-colors hover:border-foreground/15 hover:bg-secondary dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.08]"
        href={`/dashboard/tags/${id}`}
        data-id={id}
        draggable={false}
        prefetch={false}
      >
        {name}
        <span className="min-w-6 rounded-full bg-background px-1.5 py-0.5 text-center text-xs tabular-nums text-muted-foreground transition-colors group-hover:text-foreground dark:bg-white/[0.06]">
          {count}
        </span>
      </Link>

      {isHovered && !isDraggable && (
        <Button
          size="none"
          variant="secondary"
          className="absolute -right-1.5 -top-1.5 hidden rounded-full border border-border bg-background p-0.5 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground group-hover:block"
          onClick={() => onOpenDialog({ id, name })}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
  if (!isDraggable) {
    return pill;
  }
  return (
    <Draggable
      key={id}
      axis="both"
      onStart={dragAndDropFunction.handleDragStart}
      onStop={dragAndDropFunction.handleDragEnd}
      disabled={!isDraggable}
      defaultClassNameDragging={"position-relative z-10 pointer-events-none"}
      position={{ x: 0, y: 0 }}
      nodeRef={draggableRef}
    >
      {pill}
    </Draggable>
  );
});
