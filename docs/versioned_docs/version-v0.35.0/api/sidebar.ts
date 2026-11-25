import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api/karakeep-api",
    },
    {
      type: "category",
      label: "Bookmarks",
      items: [
        {
          type: "doc",
          id: "api/list-bookmarks",
          label: "Get all bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-bookmark",
          label: "Create a new bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/search-bookmarks",
          label: "Search bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/check-bookmark-url",
          label: "Check if a URL exists in bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-bookmark",
          label: "Get a single bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-bookmark",
          label: "Delete a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-bookmark",
          label: "Update a bookmark",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/summarize-bookmark",
          label: "Summarize a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/attach-tags-to-bookmark",
          label: "Attach tags to a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/detach-tags-from-bookmark",
          label: "Detach tags from a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/get-bookmark-lists",
          label: "Get lists of a bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-bookmark-highlights",
          label: "Get highlights of a bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/attach-asset-to-bookmark",
          label: "Attach asset to a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/replace-asset-on-bookmark",
          label: "Replace asset on a bookmark",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api/detach-asset-from-bookmark",
          label: "Detach asset from a bookmark",
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
          id: "api/list-lists",
          label: "Get all lists",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-list",
          label: "Create a new list",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-list",
          label: "Get a single list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-list",
          label: "Delete a list",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-list",
          label: "Update a list",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/get-list-bookmarks",
          label: "Get bookmarks in a list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/add-bookmark-to-list",
          label: "Add a bookmark to a list",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api/remove-bookmark-from-list",
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
          id: "api/list-tags",
          label: "Get all tags",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-tag",
          label: "Create a new tag",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-tag",
          label: "Get a single tag",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-tag",
          label: "Delete a tag",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-tag",
          label: "Update a tag",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/get-tag-bookmarks",
          label: "Get bookmarks with a tag",
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
          id: "api/list-highlights",
          label: "Get all highlights",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-highlight",
          label: "Create a new highlight",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-highlight",
          label: "Get a single highlight",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-highlight",
          label: "Delete a highlight",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-highlight",
          label: "Update a highlight",
          className: "api-method patch",
        },
      ],
    },
    {
      type: "category",
      label: "Assets",
      items: [
        {
          type: "doc",
          id: "api/upload-asset",
          label: "Upload a new asset",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-asset",
          label: "Get a single asset",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Users",
      items: [
        {
          type: "doc",
          id: "api/get-current-user",
          label: "Get current user info",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-current-user-stats",
          label: "Get current user stats",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Admin",
      items: [
        {
          type: "doc",
          id: "api/admin-update-user",
          label: "Update a user (admin)",
          className: "api-method put",
        },
      ],
    },
    {
      type: "category",
      label: "Backups",
      items: [
        {
          type: "doc",
          id: "api/list-backups",
          label: "Get all backups",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-backup",
          label: "Trigger a new backup",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-backup",
          label: "Get a single backup",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-backup",
          label: "Delete a backup",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/download-backup",
          label: "Download a backup",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
