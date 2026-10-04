import { Fragment, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
  Archive,
  Camera,
  Download,
  FileCode,
  FileText,
  Image,
  Paperclip,
  SquareUser,
  Upload,
  Video,
} from "lucide-react-native";

import type { ZAssetType, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { humanFriendlyNameForAssertType } from "@karakeep/shared/utils/assetUtils";

import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { downloadAttachment } from "@/lib/downloadAttachment";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";

const ASSET_ICONS: Record<ZAssetType, typeof Paperclip> = {
  screenshot: Camera,
  pdf: FileText,
  assetScreenshot: Camera,
  fullPageArchive: Archive,
  precrawledArchive: Archive,
  bannerImage: Image,
  video: Video,
  bookmarkAsset: Paperclip,
  linkHtmlContent: FileCode,
  userUploaded: Upload,
  avatar: SquareUser,
  unknown: Paperclip,
};

export default function AttachmentBox({ bookmark }: { bookmark: ZBookmark }) {
  const { settings } = useAppSettings();
  const { colors } = useColorScheme();
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadInProgress = useRef(false);
  const assets = [...bookmark.assets].sort((a, b) =>
    a.assetType.localeCompare(b.assetType),
  );

  const download = async (asset: ZBookmark["assets"][number]) => {
    if (downloadInProgress.current) return;
    downloadInProgress.current = true;
    setDownloadingId(asset.id);
    try {
      await downloadAttachment(asset, settings);
    } catch (error) {
      toast({
        message:
          error instanceof Error
            ? error.message
            : "Failed to download attachment",
        variant: "destructive",
        showProgress: false,
      });
    } finally {
      downloadInProgress.current = false;
      setDownloadingId(null);
    }
  };

  return (
    <GroupedSection header="Attachments">
      {assets.length === 0 ? (
        <Text color="tertiary" className="px-4 py-3">
          No attachments
        </Text>
      ) : (
        <>
          {assets.map((asset, index) => {
            const Icon = ASSET_ICONS[asset.assetType];
            const name =
              asset.assetType === "userUploaded" && asset.fileName
                ? asset.fileName
                : humanFriendlyNameForAssertType(asset.assetType);
            const isDownloading = downloadingId === asset.id;
            return (
              <Fragment key={asset.id}>
                {index > 0 && <RowSeparator />}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${name}`}
                  accessibilityHint="Opens options to save or share this attachment"
                  accessibilityState={{
                    disabled: downloadingId !== null,
                    busy: isDownloading,
                  }}
                  disabled={downloadingId !== null}
                  onPress={() => void download(asset)}
                  className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                >
                  <Icon size={20} color={colors.grey} />
                  <Text className="flex-1" numberOfLines={2}>
                    {name}
                  </Text>
                  <View className="h-6 w-6 items-center justify-center">
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Download size={20} color={colors.primary} />
                    )}
                  </View>
                </Pressable>
              </Fragment>
            );
          })}
          <RowSeparator />
          <Text variant="footnote" color="tertiary" className="px-4 py-3">
            Tap an attachment to save or share it.
          </Text>
        </>
      )}
    </GroupedSection>
  );
}
