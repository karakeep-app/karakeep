import { ZBookmark } from "@karakeep/shared/types/bookmarks";

export interface ContentRenderer {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  canRender: (bookmark: ZBookmark) => boolean;
  component: React.ComponentType<{ bookmark: ZBookmark }>;
  priority?: number;
}

export interface ContentRendererRegistry {
  register: (renderer: ContentRenderer) => void;
  getRenderers: (bookmark: ZBookmark) => ContentRenderer[];
  getAllRenderers: () => ContentRenderer[];
}
