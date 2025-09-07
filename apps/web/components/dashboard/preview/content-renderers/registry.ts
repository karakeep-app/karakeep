import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer, ContentRendererRegistry } from "./types";

class ContentRendererRegistryImpl implements ContentRendererRegistry {
  private renderers: Map<string, ContentRenderer> = new Map<
    string,
    ContentRenderer
  >();

  register(renderer: ContentRenderer): void {
    this.renderers.set(renderer.id, renderer);
  }

  getRenderers(bookmark: ZBookmark): ContentRenderer[] {
    return [...this.renderers.values()]
      .filter((renderer) => renderer.canRender(bookmark))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  getAllRenderers(): ContentRenderer[] {
    return [...this.renderers.values()];
  }
}

export const contentRendererRegistry = new ContentRendererRegistryImpl();
