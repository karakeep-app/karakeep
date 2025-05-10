import React, { useEffect } from "react";

import { ZBookmarkedLink } from "@karakeep/shared/types/bookmarks";

export function WarcViewSection({
  link,
  assets,
}: {
  link: ZBookmarkedLink;
  assets: { id: string; assetType: string }[];
}) {
  const warcAssetId =
    link.linkWarcArchiveAssetId ??
    assets.find((a) => a.assetType === "linkWarcArchive")?.id;
  const warcUrl =
    (typeof window !== "undefined" ? window.location.origin : "") +
    `/api/assets/${warcAssetId}`;
  useEffect(() => {
    if (!warcAssetId || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/api/assets/sw.js", { scope: "/api/assets/" })
      .then(() => navigator.serviceWorker.ready)
      .catch((e) => console.error("sw fail", e));
  }, [warcAssetId]);

  if (!warcAssetId)
    return (
      <div className="flex h-full items-center justify-center">
        Asset not found
      </div>
    );

  return (
    <div className="h-full w-full flex-1">
      {React.createElement("replay-web-page", {
        replayBase: "/api/assets/",
        source: warcUrl,
        url: link.url,
        embed: "default",
      })}
    </div>
  );
}
