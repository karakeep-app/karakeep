"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/trpc";
import { AnimatePresence, motion } from "framer-motion";

interface SidebarItemCountProps {
  type: "bookmarks" | "tags" | "highlights" | "archived";
}

export default function SidebarItemCount({ type }: SidebarItemCountProps) {
  const [mounted, setMounted] = useState(false);
  const [prevCount, setPrevCount] = useState<number | undefined>(undefined);
  const { data: stats } = api.users.stats.useQuery();

  useEffect(() => {
    setMounted(true);
  }, []);

  let count: number | undefined;
  switch (type) {
    case "bookmarks":
      count = stats?.numBookmarks;
      break;
    case "tags":
      count = stats?.numTags;
      break;
    case "highlights":
      count = stats?.numHighlights;
      break;
    case "archived":
      count = stats?.numArchived;
      break;
  }

  const isIncreasing =
    prevCount !== undefined && count !== undefined && count > prevCount;
  const isDecreasing =
    prevCount !== undefined && count !== undefined && count < prevCount;

  useEffect(() => {
    if (count !== undefined && count !== prevCount) {
      setPrevCount(count);
    }
  }, [count, prevCount]);

  if (!mounted) {
    return null; // Return null during SSR and initial render to avoid hydration mismatch
  }

  if (typeof count !== "number") {
    return null;
  }

  return (
    <Badge className="m-auto mr-2 flex h-5 w-5 justify-center rounded-full border border-sky-500/30 bg-sky-500/20 font-mono tabular-nums text-sky-400 hover:bg-sky-500/20">
      <AnimatePresence mode="wait">
        <motion.span
          key={count}
          initial={{
            y: isIncreasing ? 10 : isDecreasing ? -10 : 0,
            opacity: 0,
            scale: 0.8,
          }}
          animate={{
            y: 0,
            opacity: 1,
            scale: 1,
          }}
          exit={{
            y: isIncreasing ? -10 : isDecreasing ? 10 : 0,
            opacity: 0,
            scale: 0.8,
          }}
          transition={{
            duration: 0.2,
            ease: "easeOut",
          }}
          className="inline-block"
        >
          {count.toLocaleString()}
        </motion.span>
      </AnimatePresence>
    </Badge>
  );
}
