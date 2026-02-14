import { amazonRenderer } from "./AmazonRenderer";
import { gitHubRenderer } from "./GitHubRenderer";
import { hackerNewsRenderer } from "./HackerNewsRenderer";
import { redditRenderer } from "./RedditRenderer";
import { contentRendererRegistry } from "./registry";
import { stackOverflowRenderer } from "./StackOverflowRenderer";
import { tikTokRenderer } from "./TikTokRenderer";
import { xRenderer } from "./XRenderer";
import { youTubeRenderer } from "./YouTubeRenderer";

contentRendererRegistry.register(youTubeRenderer);
contentRendererRegistry.register(xRenderer);
contentRendererRegistry.register(amazonRenderer);
contentRendererRegistry.register(tikTokRenderer);
contentRendererRegistry.register(redditRenderer);
contentRendererRegistry.register(gitHubRenderer);
contentRendererRegistry.register(stackOverflowRenderer);
contentRendererRegistry.register(hackerNewsRenderer);

export { contentRendererRegistry };
export * from "./types";
