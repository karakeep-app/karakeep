import { amazonRenderer } from "./AmazonRenderer";
import { platformCaptureRenderer } from "./PlatformCaptureRenderer";
import { contentRendererRegistry } from "./registry";
import { tikTokRenderer } from "./TikTokRenderer";
import { xRenderer } from "./XRenderer";
import { youTubeRenderer } from "./YouTubeRenderer";

contentRendererRegistry.register(platformCaptureRenderer);
contentRendererRegistry.register(youTubeRenderer);
contentRendererRegistry.register(xRenderer);
contentRendererRegistry.register(amazonRenderer);
contentRendererRegistry.register(tikTokRenderer);

export { contentRendererRegistry };
export * from "./types";
