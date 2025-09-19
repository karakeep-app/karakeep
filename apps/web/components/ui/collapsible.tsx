"use client";

import { cn } from "@/lib/utils";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRight, Triangle } from "lucide-react";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

function CollapsibleTriggerTriangle({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <CollapsibleTrigger asChild>
      <Triangle
        className={cn(
          "fill-foreground",
          !open ? "rotate-90" : "rotate-180",
          className,
        )}
      />
    </CollapsibleTrigger>
  );
}

function CollapsibleTriggerChevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <CollapsibleTrigger asChild>
      <ChevronRight
        className={cn(!open ? "rotate-0" : "rotate-90", className)}
      />
    </CollapsibleTrigger>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleTriggerTriangle,
  CollapsibleTriggerChevron,
};
