# Custom bookmark metadata

Use `customMetadata` to store integration data on a bookmark through the API. For example, an integration can record a repository ID or a paper's DOI without turning those values into tags.

## Create and update

Include a JSON object in `POST /api/v1/bookmarks`:

```json
{
  "type": "link",
  "url": "https://github.com/karakeep-app/karakeep",
  "customMetadata": {
    "github.repositoryId": "753589979",
    "github.language": "TypeScript"
  }
}
```

Use `PATCH /api/v1/bookmarks/{bookmarkId}` to change individual keys:

```json
{
  "customMetadata": {
    "github.language": "JavaScript",
    "github.repositoryId": null
  }
}
```

This replaces `github.language` and removes `github.repositoryId`. Other top-level keys keep their values. Nested objects and arrays are replaced as whole values, rather than merged recursively. Use separate top-level keys for data managed by different integrations.

Omitting `customMetadata`, or sending `{}`, leaves existing metadata unchanged. To clear metadata, send `null` for each key you want to remove. Top-level null values act as deletions on creation too; null values inside objects and arrays remain JSON data.

Keys must contain 1–128 characters. Values can contain JSON strings, numbers, booleans, objects, arrays, and nested nulls. Both the submitted object and the resulting stored object must fit in 16,384 UTF-8 bytes when JSON-encoded. An update that exceeds this limit fails without changing the bookmark.

Re-saving an existing link through `POST` uses the same merge rules. Sources that skip existing bookmarks, such as imports, continue to leave those bookmarks unchanged.

## Reading, sharing, and backups

Authenticated bookmark responses include the owner's metadata. Existing bookmarks without metadata return `null`; removing all keys leaves `{}`. Collaborators receive `null`, and public bookmark responses omit the field. Only the bookmark owner can change it. Owner-configured integrations that receive bookmark payloads may also receive these values; do not store credentials here.

Karakeep JSON exports and imports preserve metadata for supported bookmark types. Database backups include it for all bookmark types. HTML bookmark exports cannot carry custom metadata. Metadata is not indexed for search and has no editor in the web or mobile apps.
