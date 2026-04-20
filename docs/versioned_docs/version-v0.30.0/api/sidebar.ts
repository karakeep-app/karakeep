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
          id: "api/get-all-bookmarks",
          label: "Get all bookmarks",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-a-new-bookmark",
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
          id: "api/get-a-single-bookmark",
          label: "Get a single bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-a-bookmark",
          label: "Delete a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-a-bookmark",
          label: "Update a bookmark",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/summarize-a-bookmark",
          label: "Summarize a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/attach-tags-to-a-bookmark",
          label: "Attach tags to a bookmark",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/detach-tags-from-a-bookmark",
          label: "Detach tags from a bookmark",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/get-lists-of-a-bookmark",
          label: "Get lists of a bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-highlights-of-a-bookmark",
          label: "Get highlights of a bookmark",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/attach-asset",
          label: "Attach asset",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/replace-asset",
          label: "Replace asset",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api/detach-asset",
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
          id: "api/get-all-lists",
          label: "Get all lists",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-a-new-list",
          label: "Create a new list",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-a-single-list",
          label: "Get a single list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-a-list",
          label: "Delete a list",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-a-list",
          label: "Update a list",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/get-bookmarks-in-the-list",
          label: "Get bookmarks in the list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/add-a-bookmark-to-a-list",
          label: "Add a bookmark to a list",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api/remove-a-bookmark-from-a-list",
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
          id: "api/get-all-tags",
          label: "Get all tags",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-a-new-tag",
          label: "Create a new tag",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-a-single-tag",
          label: "Get a single tag",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-a-tag",
          label: "Delete a tag",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-a-tag",
          label: "Update a tag",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api/get-bookmarks-with-the-tag",
          label: "Get bookmarks with the tag",
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
          id: "api/get-all-highlights",
          label: "Get all highlights",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/create-a-new-highlight",
          label: "Create a new highlight",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-a-single-highlight",
          label: "Get a single highlight",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-a-highlight",
          label: "Delete a highlight",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/update-a-highlight",
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
          id: "api/get-current-user-info",
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
      label: "Assets",
      items: [
        {
          type: "doc",
          id: "api/upload-a-new-asset",
          label: "Upload a new asset",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-a-single-asset",
          label: "Get a single asset",
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
          id: "api/update-user",
          label: "Update user",
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
          id: "api/get-all-backups",
          label: "Get all backups",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/trigger-a-new-backup",
          label: "Trigger a new backup",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-a-single-backup",
          label: "Get a single backup",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/delete-a-backup",
          label: "Delete a backup",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api/download-a-backup",
          label: "Download a backup",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
