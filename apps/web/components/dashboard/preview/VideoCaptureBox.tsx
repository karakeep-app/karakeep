import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientConfig } from "@/lib/clientConfig";
import { CheckCircle2, Loader2, RotateCw, Video, XCircle } from "lucide-react";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

type CaptureChoice = "default" | "on" | "off";

function toChoice(captureVideo: boolean | null | undefined): CaptureChoice {
  if (captureVideo === true) return "on";
  if (captureVideo === false) return "off";
  return "default";
}

function fromChoice(choice: CaptureChoice): boolean | null {
  if (choice === "on") return true;
  if (choice === "off") return false;
  return null;
}

function StatusLine({ bookmark }: { bookmark: ZBookmark }) {
  const { mutate: updateBookmark, isPending } = useUpdateBookmark();
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  const { videoDownloadStatus, videoAssetId } = bookmark.content;

  if (
    videoDownloadStatus === "pending" ||
    videoDownloadStatus === "downloading"
  ) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>Downloading video…</span>
      </div>
    );
  }
  if (videoAssetId) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-green-600" />
        <span>Video saved</span>
      </div>
    );
  }
  if (videoDownloadStatus === "failure") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <XCircle className="size-4 text-destructive" />
        <span>Download failed</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2"
          disabled={isPending}
          onClick={() =>
            updateBookmark({ bookmarkId: bookmark.id, captureVideo: true })
          }
        >
          <RotateCw className="size-3" />
          Retry
        </Button>
      </div>
    );
  }
  return null;
}

export default function VideoCaptureBox({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const clientConfig = useClientConfig();
  const { mutate: updateBookmark, isPending } = useUpdateBookmark();

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const serverDefaultLabel = clientConfig.crawler.videoDownloadEnabled
    ? "on"
    : "off";

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Video className="size-3.5" />
        Video capture
      </p>
      <Select
        value={toChoice(bookmark.captureVideo)}
        disabled={disabled || isPending}
        onValueChange={(choice) =>
          updateBookmark({
            bookmarkId: bookmark.id,
            captureVideo: fromChoice(choice as CaptureChoice),
          })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">
            Default (server: {serverDefaultLabel})
          </SelectItem>
          <SelectItem value="on">On</SelectItem>
          <SelectItem value="off">Off</SelectItem>
        </SelectContent>
      </Select>
      <StatusLine bookmark={bookmark} />
    </div>
  );
}
