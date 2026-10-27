import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  BookmarkTypes,
  zBookmarkSchema,
} from "@karakeep/shared/types/bookmarks";

import AttachmentBox from "./AttachmentBox";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: () => "Attachments" }),
}));
vi.mock("@/lib/hooks/upload-file", () => ({
  default: () => ({ mutate: vi.fn() }),
}));
vi.mock("@karakeep/shared-react/hooks/assets", () => ({
  useAttachBookmarkAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useReplaceBookmarkAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useDetachBookmarkAsset: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/ui/action-button", () => ({ ActionButton: () => null }));
vi.mock("@/components/ui/action-confirming-dialog", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/file-picker-button", () => ({ default: () => null }));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));

function renderAttachment(size?: number | null) {
  const bookmark = zBookmarkSchema.parse({
    id: "bookmark",
    createdAt: new Date("2026-01-01"),
    modifiedAt: null,
    archived: false,
    favourited: false,
    taggingStatus: null,
    summarizationStatus: null,
    embeddingStatus: null,
    userId: "user",
    content: { type: BookmarkTypes.LINK, url: "https://example.com" },
    tags: [],
    assets: [{ id: "archive", assetType: "fullPageArchive", size }],
  });
  return renderToStaticMarkup(
    createElement(AttachmentBox, { bookmark, readOnly: true }),
  );
}

describe("attachment sizes", () => {
  it.each([
    [245 * 1024, "245 KB"],
    [3 * 1024 * 1024, "3 MB"],
    [0, "0 Bytes"],
  ])("displays %i bytes beside the attachment", (size, label) => {
    const html = renderAttachment(size);
    expect(html).toContain(label);
    expect(html).toContain("Full Page Archive");
    expect(html).toContain("/api/assets/archive");
  });

  it.each([undefined, null])(
    "omits unknown sizes for older server responses (%s)",
    (size) => {
      const html = renderAttachment(size);
      expect(html).toContain("Full Page Archive");
      expect(html).not.toMatch(/Bytes|KB|MB|undefined|null/);
    },
  );
});
