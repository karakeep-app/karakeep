import type {
  ZPreferredLinkPreview,
  ZReaderViewReason,
  ZReaderViewStatus,
} from "@karakeep/shared/types/bookmarks";

interface LinkPreviewSignals {
  readerViewStatus: ZReaderViewStatus | null;
  readerViewReasons: ZReaderViewReason[] | null;
  crawlStatusCode: number | null;
  hasScreenshot: boolean;
}

export function getPreferredLinkPreview({
  readerViewStatus,
  readerViewReasons,
  crawlStatusCode,
  hasScreenshot,
}: LinkPreviewSignals): ZPreferredLinkPreview {
  const capturedChallengePage =
    readerViewReasons?.includes("challenge_page") ?? false;
  if (capturedChallengePage) {
    return "overview";
  }

  if (!readerViewStatus || readerViewStatus === "readable") {
    return "reader_view";
  }

  const crawlSucceeded =
    crawlStatusCode === null ||
    (crawlStatusCode >= 200 && crawlStatusCode <= 299);

  if (hasScreenshot && crawlSucceeded) {
    return "screenshot";
  }

  return "overview";
}
