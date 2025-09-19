import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "API/hoarder-api",
    },
    {
      type: "category",
      label: "Bookmarks",
      items: [
        {
          type: "doc",
          id: "API/get-all-bookmarks",
          label: "Get all bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/create-a-new-bookmark",
          label: "Create a new bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/search-bookmarks",
          label: "Search bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/get-a-single-bookmark",
          label: "Get a single bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/delete-a-bookmark",
          label: "Delete a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "API/update-a-bookmark",
          label: "Update a bookmark",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "API/summarize-a-bookmark",
          label: "Summarize a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/attach-tags-to-a-bookmark",
          label: "Attach tags to a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/detach-tags-from-a-bookmark",
          label: "Detach tags from a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "API/get-highlights-of-a-bookmark",
          label: "Get highlights of a bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/attach-asset",
          label: "Attach asset",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/replace-asset",
          label: "Replace asset",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "API/detach-asset",
          label: "Detach asset",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "Lists",
      items: [
        {
          type: "doc",
          id: "API/get-all-lists",
          label: "Get all lists",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/create-a-new-list",
          label: "Create a new list",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/get-a-single-list",
          label: "Get a single list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/delete-a-list",
          label: "Delete a list",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "API/update-a-list",
          label: "Update a list",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "API/get-a-bookmarks-in-a-list",
          label: "Get a bookmarks in a list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/add-a-bookmark-to-a-list",
          label: "Add a bookmark to a list",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "API/remove-a-bookmark-from-a-list",
          label: "Remove a bookmark from a list",
          className: "api-method delete",
        },
      ],
    },
    {
      type: "category",
      label: "Tags",
      items: [
        {
          type: "doc",
          id: "API/get-all-tags",
          label: "Get all tags",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/get-a-single-tag",
          label: "Get a single tag",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/delete-a-tag",
          label: "Delete a tag",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "API/update-a-tag",
          label: "Update a tag",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "API/get-a-bookmarks-with-the-tag",
          label: "Get a bookmarks with the tag",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Highlights",
      items: [
        {
          type: "doc",
          id: "API/get-all-highlights",
          label: "Get all highlights",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/create-a-new-highlight",
          label: "Create a new highlight",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "API/get-a-single-highlight",
          label: "Get a single highlight",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/delete-a-highlight",
          label: "Delete a highlight",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "API/update-a-highlight",
          label: "Update a highlight",
          className: "api-method patch",
        },
      ],
    },
    {
      type: "category",
      label: "Users",
      items: [
        {
          type: "doc",
          id: "API/get-current-user-info",
          label: "Get current user info",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "API/get-current-user-stats",
          label: "Get current user stats",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
