/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface paths {
  "/bookmarks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get all bookmarks
     * @description Get all bookmarks
     */
    get: {
      parameters: {
        query?: {
          archived?: boolean;
          favourited?: boolean;
          limit?: number;
          cursor?: components["schemas"]["Cursor"];
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with all bookmarks data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["PaginatedBookmarks"];
          };
        };
      };
    };
    put?: never;
    /**
     * Create a new bookmark
     * @description Create a new bookmark
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      /** @description The bookmark to create */
      requestBody?: {
        content: {
          "application/json": {
            title?: string | null;
            archived?: boolean;
            favourited?: boolean;
            note?: string;
            summary?: string;
            createdAt?: string | null;
          } & (
            | {
                /** @enum {string} */
                type: "link";
                /** Format: uri */
                url: string;
                precrawledArchiveId?: string;
              }
            | {
                /** @enum {string} */
                type: "text";
                text: string;
                sourceUrl?: string;
              }
            | {
                /** @enum {string} */
                type: "asset";
                /** @enum {string} */
                assetType: "image" | "pdf";
                assetId: string;
                fileName?: string;
                sourceUrl?: string;
              }
          );
        };
      };
      responses: {
        /** @description The created bookmark */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Bookmark"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Search bookmarks
     * @description Search bookmarks
     */
    get: {
      parameters: {
        query: {
          q: string;
          limit?: number;
          cursor?: components["schemas"]["Cursor"];
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with the search results. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["PaginatedBookmarks"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/{bookmarkId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a single bookmark
     * @description Get bookmark by its id
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with bookmark data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Bookmark"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    /**
     * Delete a bookmark
     * @description Delete bookmark by its id
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - the bookmark was deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    /**
     * Update a bookmark
     * @description Update bookmark by its id
     */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      /** @description The data to update. Only the fields you want to update need to be provided. */
      requestBody?: {
        content: {
          "application/json": {
            archived?: boolean;
            favourited?: boolean;
            summary?: string | null;
            note?: string;
            title?: string | null;
            createdAt?: string | null;
            /** Format: uri */
            url?: string;
            description?: string | null;
            author?: string | null;
            publisher?: string | null;
            datePublished?: string | null;
            dateModified?: string | null;
            text?: string | null;
          };
        };
      };
      responses: {
        /** @description The updated bookmark */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              id: string;
              createdAt: string;
              modifiedAt: string | null;
              title?: string | null;
              archived: boolean;
              favourited: boolean;
              /** @enum {string|null} */
              taggingStatus: "success" | "failure" | "pending" | null;
              note?: string | null;
              summary?: string | null;
            };
          };
        };
      };
    };
    trace?: never;
  };
  "/bookmarks/{bookmarkId}/summarize": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Summarize a bookmark
     * @description Attaches a summary to the bookmark and returns the updated record.
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description The updated bookmark with summary */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              id: string;
              createdAt: string;
              modifiedAt: string | null;
              title?: string | null;
              archived: boolean;
              favourited: boolean;
              /** @enum {string|null} */
              taggingStatus: "success" | "failure" | "pending" | null;
              note?: string | null;
              summary?: string | null;
            };
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/{bookmarkId}/tags": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Attach tags to a bookmark
     * @description Attach tags to a bookmark
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      /** @description The tags to attach. */
      requestBody?: {
        content: {
          "application/json": {
            tags: {
              tagId?: string;
              tagName?: string;
            }[];
          };
        };
      };
      responses: {
        /** @description The list of attached tag ids */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              attached: components["schemas"]["TagId"][];
            };
          };
        };
      };
    };
    /**
     * Detach tags from a bookmark
     * @description Detach tags from a bookmark
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      /** @description The tags to detach. */
      requestBody?: {
        content: {
          "application/json": {
            tags: {
              tagId?: string;
              tagName?: string;
            }[];
          };
        };
      };
      responses: {
        /** @description The list of detached tag ids */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              detached: components["schemas"]["TagId"][];
            };
          };
        };
      };
    };
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/{bookmarkId}/highlights": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get highlights of a bookmark
     * @description Get highlights of a bookmark
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description The list of highlights */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              highlights: components["schemas"]["Highlight"][];
            };
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/{bookmarkId}/assets": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Attach asset
     * @description Attach a new asset to a bookmark
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      /** @description The asset to attach */
      requestBody?: {
        content: {
          "application/json": {
            id: string;
            /** @enum {string} */
            assetType:
              | "screenshot"
              | "assetScreenshot"
              | "bannerImage"
              | "fullPageArchive"
              | "video"
              | "bookmarkAsset"
              | "precrawledArchive"
              | "unknown";
          };
        };
      };
      responses: {
        /** @description The attached asset */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              id: string;
              /** @enum {string} */
              assetType:
                | "screenshot"
                | "assetScreenshot"
                | "bannerImage"
                | "fullPageArchive"
                | "video"
                | "bookmarkAsset"
                | "precrawledArchive"
                | "unknown";
            };
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/bookmarks/{bookmarkId}/assets/{assetId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Replace asset
     * @description Replace an existing asset with a new one
     */
    put: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
          assetId: components["parameters"]["AssetId"];
        };
        cookie?: never;
      };
      /** @description The new asset to replace with */
      requestBody?: {
        content: {
          "application/json": {
            assetId: string;
          };
        };
      };
      responses: {
        /** @description No content - asset was replaced successfully */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    post?: never;
    /**
     * Detach asset
     * @description Detach an asset from a bookmark
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          bookmarkId: components["parameters"]["BookmarkId"];
          assetId: components["parameters"]["AssetId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - asset was detached successfully */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/lists": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get all lists
     * @description Get all lists
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with all lists data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              lists: components["schemas"]["List"][];
            };
          };
        };
      };
    };
    put?: never;
    /**
     * Create a new list
     * @description Create a new list
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      /** @description The list to create */
      requestBody?: {
        content: {
          "application/json": {
            name: string;
            icon: string;
            /**
             * @default manual
             * @enum {string}
             */
            type?: "manual" | "smart";
            query?: string;
            parentId?: string | null;
          };
        };
      };
      responses: {
        /** @description The created list */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["List"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/lists/{listId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a single list
     * @description Get list by its id
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with list data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["List"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    /**
     * Delete a list
     * @description Delete list by its id
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - the bookmark was deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    /**
     * Update a list
     * @description Update list by its id
     */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      /** @description The data to update. Only the fields you want to update need to be provided. */
      requestBody?: {
        content: {
          "application/json": {
            name?: string;
            icon?: string;
            parentId?: string | null;
            query?: string;
          };
        };
      };
      responses: {
        /** @description The updated list */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["List"];
          };
        };
      };
    };
    trace?: never;
  };
  "/lists/{listId}/bookmarks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a bookmarks in a list
     * @description Get the bookmarks in a list
     */
    get: {
      parameters: {
        query?: {
          limit?: number;
          cursor?: components["schemas"]["Cursor"];
        };
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with list data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["PaginatedBookmarks"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/lists/{listId}/bookmarks/{bookmarkId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Add a bookmark to a list
     * @description Add the bookmarks to a list
     */
    put: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - the bookmark was added */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    post?: never;
    /**
     * Remove a bookmark from a list
     * @description Remove the bookmarks from a list
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          listId: components["parameters"]["ListId"];
          bookmarkId: components["parameters"]["BookmarkId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - the bookmark was added */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/tags": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get all tags
     * @description Get all tags
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with all tags data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              tags: components["schemas"]["Tag"][];
            };
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/tags/{tagId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a single tag
     * @description Get tag by its id
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          tagId: components["parameters"]["TagId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with list data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Tag"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    /**
     * Delete a tag
     * @description Delete tag by its id
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          tagId: components["parameters"]["TagId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description No content - the bookmark was deleted */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
      };
    };
    options?: never;
    head?: never;
    /**
     * Update a tag
     * @description Update tag by its id
     */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          tagId: components["parameters"]["TagId"];
        };
        cookie?: never;
      };
      /** @description The data to update. Only the fields you want to update need to be provided. */
      requestBody?: {
        content: {
          "application/json": {
            name?: string;
          };
        };
      };
      responses: {
        /** @description The updated tag */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Tag"];
          };
        };
      };
    };
    trace?: never;
  };
  "/tags/{tagId}/bookmarks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a bookmarks with the tag
     * @description Get the bookmarks with the tag
     */
    get: {
      parameters: {
        query?: {
          limit?: number;
          cursor?: components["schemas"]["Cursor"];
        };
        header?: never;
        path: {
          tagId: components["parameters"]["TagId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with list data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["PaginatedBookmarks"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/highlights": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get all highlights
     * @description Get all highlights
     */
    get: {
      parameters: {
        query?: {
          limit?: number;
          cursor?: components["schemas"]["Cursor"];
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with all highlights data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["PaginatedHighlights"];
          };
        };
      };
    };
    put?: never;
    /**
     * Create a new highlight
     * @description Create a new highlight
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      /** @description The highlight to create */
      requestBody?: {
        content: {
          "application/json": {
            bookmarkId: string;
            startOffset: number;
            endOffset: number;
            /**
             * @default yellow
             * @enum {string}
             */
            color?: "yellow" | "red" | "green" | "blue";
            text: string | null;
            note: string | null;
          };
        };
      };
      responses: {
        /** @description The created highlight */
        201: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Highlight"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/highlights/{highlightId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a single highlight
     * @description Get highlight by its id
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          highlightId: components["parameters"]["HighlightId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with highlight data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Highlight"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    /**
     * Delete a highlight
     * @description Delete highlight by its id
     */
    delete: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          highlightId: components["parameters"]["HighlightId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description The deleted highlight */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Highlight"];
          };
        };
      };
    };
    options?: never;
    head?: never;
    /**
     * Update a highlight
     * @description Update highlight by its id
     */
    patch: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          highlightId: components["parameters"]["HighlightId"];
        };
        cookie?: never;
      };
      /** @description The data to update. Only the fields you want to update need to be provided. */
      requestBody?: {
        content: {
          "application/json": {
            /** @enum {string} */
            color?: "yellow" | "red" | "green" | "blue";
          };
        };
      };
      responses: {
        /** @description The updated highlight */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["Highlight"];
          };
        };
      };
    };
    trace?: never;
  };
  "/users/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get current user info
     * @description Returns info about the current user
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with user data. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              id: string;
              name?: string | null;
              email?: string | null;
            };
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/users/me/stats": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get current user stats
     * @description Returns stats about the current user
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Object with user stats. */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": {
              numBookmarks: number;
              numFavorites: number;
              numArchived: number;
              numTags: number;
              numLists: number;
              numHighlights: number;
            };
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /** @example ieidlxygmwj87oxz5hxttoc8 */
    AssetId: string;
    /** @example ieidlxygmwj87oxz5hxttoc8 */
    BookmarkId: string;
    /** @example ieidlxygmwj87oxz5hxttoc8 */
    ListId: string;
    /** @example ieidlxygmwj87oxz5hxttoc8 */
    TagId: string;
    /** @example ieidlxygmwj87oxz5hxttoc8 */
    HighlightId: string;
    Bookmark: {
      id: string;
      createdAt: string;
      modifiedAt: string | null;
      title?: string | null;
      archived: boolean;
      favourited: boolean;
      /** @enum {string|null} */
      taggingStatus: "success" | "failure" | "pending" | null;
      note?: string | null;
      summary?: string | null;
      tags: {
        id: string;
        name: string;
        /** @enum {string} */
        attachedBy: "ai" | "human";
      }[];
      content:
        | {
            /** @enum {string} */
            type: "link";
            url: string;
            title?: string | null;
            description?: string | null;
            imageUrl?: string | null;
            imageAssetId?: string | null;
            screenshotAssetId?: string | null;
            fullPageArchiveAssetId?: string | null;
            precrawledArchiveAssetId?: string | null;
            videoAssetId?: string | null;
            favicon?: string | null;
            htmlContent?: string | null;
            crawledAt?: string | null;
            author?: string | null;
            publisher?: string | null;
            datePublished?: string | null;
            dateModified?: string | null;
          }
        | {
            /** @enum {string} */
            type: "text";
            text: string;
            sourceUrl?: string | null;
          }
        | {
            /** @enum {string} */
            type: "asset";
            /** @enum {string} */
            assetType: "image" | "pdf";
            assetId: string;
            fileName?: string | null;
            sourceUrl?: string | null;
            size?: number | null;
          }
        | {
            /** @enum {string} */
            type: "unknown";
          };
      assets: {
        id: string;
        /** @enum {string} */
        assetType:
          | "screenshot"
          | "assetScreenshot"
          | "bannerImage"
          | "fullPageArchive"
          | "video"
          | "bookmarkAsset"
          | "precrawledArchive"
          | "unknown";
      }[];
    };
    PaginatedBookmarks: {
      bookmarks: components["schemas"]["Bookmark"][];
      nextCursor: string | null;
    };
    Cursor: string;
    Highlight: {
      bookmarkId: string;
      startOffset: number;
      endOffset: number;
      /**
       * @default yellow
       * @enum {string}
       */
      color: "yellow" | "red" | "green" | "blue";
      text: string | null;
      note: string | null;
      id: string;
      userId: string;
      createdAt: string;
    };
    List: {
      id: string;
      name: string;
      icon: string;
      parentId: string | null;
      /**
       * @default manual
       * @enum {string}
       */
      type: "manual" | "smart";
      query?: string | null;
    };
    Tag: {
      id: string;
      name: string;
      numBookmarks: number;
      numBookmarksByAttachedType: {
        ai?: number;
        human?: number;
      };
    };
    PaginatedHighlights: {
      highlights: components["schemas"]["Highlight"][];
      nextCursor: string | null;
    };
  };
  responses: never;
  parameters: {
    AssetId: components["schemas"]["AssetId"];
    BookmarkId: components["schemas"]["BookmarkId"];
    ListId: components["schemas"]["ListId"];
    TagId: components["schemas"]["TagId"];
    HighlightId: components["schemas"]["HighlightId"];
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
