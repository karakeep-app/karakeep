import { requireOptionalNativeModule } from "expo-modules-core";

export interface ShareIntentFile {
  path: string;
  mimeType: string;
  fileName: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
}

export interface NativeShareIntentData {
  text: string | null;
  files: ShareIntentFile[] | null;
  type: "text" | "file" | null;
}

interface KarakeepShareIntentModuleType {
  getShareIntent(): Promise<NativeShareIntentData | null>;
  clearShareIntent(): void;
  hasShareIntent(): boolean;
  addListener(
    eventName: "onChange",
    listener: (event: { value: NativeShareIntentData }) => void,
  ): { remove: () => void };
}

const KarakeepShareIntentModule =
  requireOptionalNativeModule<KarakeepShareIntentModuleType>(
    "KarakeepShareIntentModule",
  );

export default KarakeepShareIntentModule;
