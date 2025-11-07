# Content-Aware Renderers

This directory contains the content-aware rendering system for LinkContentPreview. It allows for special rendering of different types of links based on their URL patterns.

## Architecture

The system consists of:

1. **Types** (`types.ts`): Defines the `ContentRenderer` interface
2. **Registry** (`registry.ts`): Manages registration and retrieval of renderers
3. **Individual Renderers**: Each renderer handles a specific type of content

## Creating a New Renderer

To add support for a new website or content type:

1. Create a new file (e.g., `MyWebsiteRenderer.tsx`)
2. Implement the `ContentRenderer` interface:

```typescript
import { ContentRenderer } from "./types";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { MyIcon } from "lucide-react";

function canRenderMyWebsite(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }

  // Add your URL pattern matching logic here
  return bookmark.content.url.includes("mywebsite.com");
}

function MyWebsiteRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  // Your custom rendering logic here
  return <div>Custom content for MyWebsite</div>;
}

export const myWebsiteRenderer: ContentRenderer = {
  id: "mywebsite",
  name: "My Website",
  icon: MyIcon,
  canRender: canRenderMyWebsite,
  component: MyWebsiteRendererComponent,
  priority: 10, // Higher priority = appears first in dropdown
};
```

3. Register your renderer in `index.ts`:

```typescript
import { myWebsiteRenderer } from "./MyWebsiteRenderer";

contentRendererRegistry.register(myWebsiteRenderer);
```
