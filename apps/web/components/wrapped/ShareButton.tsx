"use client";

import { RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Share2 } from "lucide-react";
import { domToPng } from "modern-screenshot";

interface ShareButtonProps {
  contentRef: RefObject<HTMLDivElement | null>;
  fileName?: string;
}

export function ShareButton({
  contentRef,
  fileName = "karakeep-wrapped-2025.png",
}: ShareButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleShare = async () => {
    if (!contentRef.current) return;

    setIsGenerating(true);

    try {
      // Capture the content as PNG data URL
      const dataUrl = await domToPng(contentRef.current, {
        scale: 2, // Higher resolution
        quality: 1,
        debug: false,
        width: contentRef.current.scrollWidth, // Capture full width
        height: contentRef.current.scrollHeight, // Capture full height including scrolled content
        drawImageInterval: 100, // Add delay for rendering
      });

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Try native share API first (works well on mobile)
      if (
        typeof navigator.share !== "undefined" &&
        typeof navigator.canShare !== "undefined"
      ) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "My 2025 Karakeep Wrapped",
            text: "Check out my 2025 Karakeep Wrapped!",
          });
          return;
        }
      }

      // Fallback: download the image
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to capture or share image:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const isNativeShareAvailable =
    typeof navigator.share !== "undefined" &&
    typeof navigator.canShare !== "undefined";

  return (
    <Button
      onClick={handleShare}
      disabled={isGenerating}
      size="icon"
      variant="ghost"
      className="h-10 w-10 rounded-full bg-white/10 text-slate-100 hover:bg-white/20"
      aria-label={isNativeShareAvailable ? "Share" : "Download"}
      title={isNativeShareAvailable ? "Share" : "Download"}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isNativeShareAvailable ? (
        <Share2 className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </Button>
  );
}
