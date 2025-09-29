"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Loader2, RefreshCw, Undo2 } from "lucide-react";

import BookmarkCard from "../bookmarks/BookmarkCard";

interface LastAction {
  type: "archived" | "quick_actions" | "skipped";
  bookmarkId: string;
  timestamp: number;
}

export default function RediscoveryScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  const { toast } = useToast();
  const apiUtils = api.useUtils();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-30, 30]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  // tRPC hooks
  const { data: accessData, isLoading: isCheckingAccess } =
    api.rediscovery.canAccess.useQuery();
  const { data: feedData, isLoading: isFeedLoading } =
    api.rediscovery.getDiscoveryFeed.useQuery(undefined, {
      enabled: accessData?.canAccess === true,
    });

  console.log("xz:feedData", feedData);

  const regenerateMutation =
    api.rediscovery.regenerateDiscoveryFeed.useMutation({
      onSuccess: () => {
        setCurrentIndex(0);
        setLastAction(null);
        toast({
          title: "Success",
          description: "Discovery feed regenerated!",
        });
        // Invalidate and refetch to update the UI
        apiUtils.rediscovery.getDiscoveryFeed.invalidate();
      },
      onError: (error) => {
        console.error("Failed to regenerate feed:", error);
        toast({
          title: "Error",
          description: "Failed to regenerate feed",
          variant: "destructive",
        });
      },
    });

  const resetHistoryMutation =
    api.rediscovery.resetRediscoveryHistory.useMutation({
      onSuccess: (data) => {
        setCurrentIndex(0);
        setLastAction(null);
        toast({
          title: "Success",
          description: `Reset complete! ${data.resetCount} bookmarks are now available for rediscovery.`,
        });
        // Invalidate and refetch to update the UI
        apiUtils.rediscovery.getDiscoveryFeed.invalidate();
        apiUtils.rediscovery.canAccess.invalidate();
      },
      onError: (error) => {
        console.error("Failed to reset rediscovery history:", error);
        toast({
          title: "Error",
          description: "Failed to reset rediscovery history",
          variant: "destructive",
        });
      },
    });

  const swipeActionMutation = api.rediscovery.processSwipeAction.useMutation({
    onSuccess: (result, variables) => {
      // Update last action for undo functionality
      if (
        variables.direction === "left" ||
        variables.direction === "right" ||
        variables.direction === "up"
      ) {
        setLastAction({
          type: result.action as "archived" | "quick_actions" | "skipped",
          bookmarkId: variables.bookmarkId,
          timestamp: Date.now(),
        });
      }

      // Move to next card for left, right, up
      if (
        variables.direction === "left" ||
        variables.direction === "right" ||
        variables.direction === "up"
      ) {
        setCurrentIndex((prev) => prev + 1);
      }
      // For down, go to previous card
      else if (variables.direction === "down" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }

      // Show success message
      const actionMessages = {
        archived: "Bookmark archived!",
        quick_actions: "Quick action applied!",
        skipped: "Bookmark skipped!",
        returned: "Returned to previous bookmark",
      };

      const toastResult = toast({
        title: "Success",
        description:
          actionMessages[result.action as keyof typeof actionMessages] ||
          "Action completed!",
      });

      // Auto-dismiss "skipped" toast after 1.5 seconds
      if (result.action === "skipped") {
        setTimeout(() => {
          toastResult.dismiss();
        }, 1500);
      }
    },
    onError: (error) => {
      console.error("Failed to process swipe:", error);
      toast({
        title: "Error",
        description: "Failed to process action",
        variant: "destructive",
      });
    },
  });

  const undoMutation = api.rediscovery.undoLastAction.useMutation({
    onSuccess: () => {
      // Move back to previous card
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setLastAction(null);

      toast({
        title: "Success",
        description: "Action undone!",
      });
    },
    onError: (error) => {
      console.error("Failed to undo action:", error);
      toast({
        title: "Error",
        description: "Failed to undo action",
        variant: "destructive",
      });
    },
  });

  const bookmarks = feedData?.bookmarks || [];
  const isLoading = isCheckingAccess || isFeedLoading;
  const canAccess = accessData?.canAccess || false;
  const message = accessData?.message || "";
  const allRecentlyRediscovered =
    accessData?.allRecentlyRediscovered ||
    feedData?.allRecentlyRediscovered ||
    false;

  const handleSwipe = async (direction: "left" | "right" | "up" | "down") => {
    if (currentIndex >= bookmarks.length) return;

    const currentBookmark = bookmarks[currentIndex];
    if (!currentBookmark) return;

    swipeActionMutation.mutate({
      bookmarkId: currentBookmark.id,
      direction,
    });
  };

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const threshold = 100;
    const { offset, velocity } = info;

    if (Math.abs(offset.x) > threshold || Math.abs(velocity.x) > 500) {
      if (offset.x > 0) {
        handleSwipe("right");
      } else {
        handleSwipe("left");
      }
    } else if (Math.abs(offset.y) > threshold || Math.abs(velocity.y) > 500) {
      if (offset.y < 0) {
        handleSwipe("up");
      } else {
        handleSwipe("down");
      }
    }
  };

  const undoLastAction = () => {
    if (!lastAction) return;

    undoMutation.mutate({
      bookmarkId: lastAction.bookmarkId,
      action: lastAction.type,
    });
  };

  const regenerateFeed = () => {
    regenerateMutation.mutate();
  };

  const resetRediscoveryHistory = () => {
    resetHistoryMutation.mutate();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading rediscovery feed...</p>
        </div>
      </div>
    );
  }

  // Show access denied message
  if (!canAccess) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="max-w-md p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold">
            Rediscovery Not Available
          </h3>
          <p className="text-muted-foreground">{message}</p>
        </Card>
      </div>
    );
  }

  // Show empty state
  if (bookmarks.length === 0 || currentIndex >= bookmarks.length) {
    if (allRecentlyRediscovered) {
      // All bookmarks have been recently rediscovered
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <Card className="max-w-md p-8 text-center">
            <h3 className="mb-4 text-lg font-semibold">🎉 All Caught Up!</h3>
            <p className="mb-6 text-muted-foreground">
              Excellent work! You&apos;ve rediscovered all your bookmarks
              recently. Want to go through them again?
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={resetRediscoveryHistory}
                disabled={resetHistoryMutation.isPending}
                className="w-full"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {resetHistoryMutation.isPending
                  ? "Resetting..."
                  : "Reset & Start Over"}
              </Button>
              <Button
                variant="outline"
                onClick={regenerateFeed}
                disabled={regenerateMutation.isPending}
                className="w-full"
              >
                Try Generate New Feed
              </Button>
            </div>
          </Card>
        </div>
      );
    } else {
      // Normal empty state - no more bookmarks in current queue
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <Card className="max-w-md p-8 text-center">
            <h3 className="mb-4 text-lg font-semibold">No More Bookmarks</h3>
            <p className="mb-6 text-muted-foreground">
              You&apos;ve gone through all available bookmarks in your current
              discovery feed.
            </p>
            <Button
              onClick={regenerateFeed}
              disabled={regenerateMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Generate New Feed
            </Button>
          </Card>
        </div>
      );
    }
  }

  const currentBookmark = bookmarks[currentIndex];

  return (
    <div className="relative">
      {/* Mobile-only notice for desktop users */}
      <div className="mb-4 block md:hidden">
        <Card className="border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            💡 Swipe left to archive, right for quick actions, up to skip, down
            to go back
          </p>
        </Card>
      </div>

      {/* Desktop notice */}
      <div className="mb-4 hidden md:block">
        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            📱 This feature is optimized for mobile devices. Please use a mobile
            device for the best experience.
          </p>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-2">
          {lastAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={undoLastAction}
              disabled={undoMutation.isPending}
              className="flex items-center gap-2"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={regenerateFeed}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Card stack */}
      <div className="relative flex h-[600px] items-center justify-center">
        {/* Show next card in background */}
        {currentIndex + 1 < bookmarks.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-md scale-95 transform opacity-50">
              <BookmarkCard bookmark={bookmarks[currentIndex + 1]} />
            </div>
          </div>
        )}

        {/* Current card */}
        <motion.div
          className="absolute inset-0 flex cursor-grab items-center justify-center active:cursor-grabbing"
          style={{
            x,
            rotate,
            opacity,
          }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          whileDrag={{ scale: 1.05 }}
          animate={{ x: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="w-full max-w-md">
            <BookmarkCard bookmark={currentBookmark} />
          </div>
        </motion.div>
      </div>

      {/* Progress indicator */}
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          {currentIndex + 1} of {bookmarks.length} bookmarks
        </p>
        <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / bookmarks.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Desktop fallback buttons */}
      <div className="mt-6 hidden justify-center gap-4 md:flex">
        <Button
          variant="outline"
          onClick={() => handleSwipe("left")}
          disabled={
            currentIndex >= bookmarks.length || swipeActionMutation.isPending
          }
        >
          Archive (←)
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSwipe("down")}
          disabled={currentIndex === 0 || swipeActionMutation.isPending}
        >
          Previous (↓)
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSwipe("up")}
          disabled={
            currentIndex >= bookmarks.length || swipeActionMutation.isPending
          }
        >
          Skip (↑)
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSwipe("right")}
          disabled={
            currentIndex >= bookmarks.length || swipeActionMutation.isPending
          }
        >
          Quick Action (→)
        </Button>
      </div>
    </div>
  );
}
