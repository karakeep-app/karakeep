# RSS Feeds

Karakeep offers comprehensive RSS feed integration, allowing you to both consume RSS feeds from external sources and publish your lists as RSS feeds for others to subscribe to.

## Publishing RSS Feeds

You can publish any of your lists as an RSS feed, making it easy to share your bookmarks with others or integrate them into RSS readers.

### Enabling RSS for a List

1. Navigate to one of your lists
2. Click on the list settings (three dots menu)
3. Toggle the "RSS Feed" switch to enable it
4. Copy the generated RSS feed URL

### RSS Feed URL Format

Once enabled, your list will be accessible via:

```
https://your-karakeep-instance.com/v1/rss/lists/{listId}?token={token}
```

The token is automatically generated and required for authentication. You can regenerate the token at any time from the list settings if you need to revoke access.

### What Gets Published

RSS feeds include:
- **Links**: Bookmarks of type "link" with their URL, title, description, and author
- **Assets**: Uploaded files (PDFs, images) are included with a link to view them
- **Tags**: Bookmark tags are exported as RSS categories
- **Dates**: The bookmark creation date is used as the publication date

Note: Text notes are not included in RSS feeds as they don't have an associated URL.

### Security Considerations

- Each RSS feed requires a unique token for access
- Tokens can be regenerated at any time, which will invalidate the old URL
- Disabling RSS for a list immediately revokes access
- RSS feeds respect your list's visibility settings

## Consuming RSS Feeds

Karakeep can automatically monitor RSS feeds and create bookmarks from new entries, making it perfect for staying up to date with blogs, news sites, and other content sources.

### Adding an RSS Feed

1. Go to **Settings** → **RSS Feeds**
2. Click **Add Feed**
3. Enter the feed details:
   - **Name**: A friendly name for the feed
   - **URL**: The RSS/Atom feed URL
   - **Enabled**: Toggle to enable/disable the feed
   - **Import Tags**: Enable to import RSS categories as bookmark tags

### How It Works

- Karakeep checks enabled RSS feeds **every hour**
- New entries are automatically created as bookmarks
- Each bookmark is linked to the feed source
- Duplicate entries are automatically detected and skipped
- Bookmarks are created with the source type "rss"

### Feed Scheduling

Feeds are intelligently distributed across the hour to avoid overloading your server:
- Each feed is assigned a specific minute within the hour based on its ID
- This ensures even distribution of feed fetching across time
- All enabled feeds are checked once per hour

### Tag Import

When **Import Tags** is enabled:
- RSS feed categories are automatically attached as tags to bookmarks
- This helps organize content from feeds that use categories
- Tags can be used for filtering and searching later

### Feed Management

You can:
- Enable/disable feeds without deleting them
- Edit feed names and URLs
- Delete feeds (bookmarks already created will remain)
- Manually trigger a feed fetch using "Fetch Now"
- View last fetch status (success/failure) and timestamp

### Feed Limits

By default, each user can create up to **1000 RSS feeds**. This limit can be configured by administrators using the `MAX_RSS_FEEDS_PER_USER` environment variable.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_RSS_FEEDS_PER_USER` | 1000 | Maximum number of RSS feeds a user can subscribe to |

### Quota System

- RSS feed fetching respects your bookmark quota
- If you've reached your bookmark limit, feed fetching will be skipped
- The system will resume creating bookmarks once quota is available

## Troubleshooting

### Feed Not Updating

If a feed isn't updating:
1. Check that the feed is **enabled** in settings
2. Verify the feed URL is still valid
3. Check the "Last Fetched" status for errors
4. Try using "Fetch Now" to manually trigger an update
5. Ensure the feed returns valid RSS/Atom XML

### Common Issues

**"Feed is not a valid RSS feed"**
- The URL doesn't return XML content
- The content-type header is not set correctly
- Try accessing the URL directly in your browser to verify

**"Maximum number of RSS feeds reached"**
- You've reached the user limit for RSS feeds
- Delete unused feeds or contact your administrator to increase the limit

**"Feed returned a non-success status"**
- The feed URL is returning an error (404, 500, etc.)
- Verify the URL is correct and accessible

**Duplicate bookmarks**
- Karakeep uses the RSS entry's GUID or link to detect duplicates
- If a feed doesn't provide consistent GUIDs, duplicates may occur

## API Access

RSS feeds can also be accessed and managed via the Karakeep API:

### Publishing (Reading RSS Feeds)

```bash
# Get RSS feed for a list
curl "https://your-instance.com/v1/rss/lists/{listId}?token={token}"
```

### Consuming (Managing Feed Subscriptions)

Use the tRPC API endpoints:
- `feeds.list` - Get all your RSS subscriptions
- `feeds.create` - Add a new RSS feed
- `feeds.update` - Update feed settings
- `feeds.delete` - Remove a feed subscription
- `feeds.fetchNow` - Manually trigger a feed fetch

See the [API documentation](/docs/category/api) for more details.

## Best Practices

1. **Use descriptive names** for feeds to easily identify them later
2. **Enable tag import** for feeds that use categories to improve organization
3. **Monitor feed status** regularly to catch broken feeds
4. **Regenerate RSS tokens** periodically for published feeds if sharing publicly
5. **Disable unused feeds** instead of deleting them to preserve historical bookmarks
6. **Use the "Fetch Now"** feature sparingly to avoid overwhelming feed servers

## Use Cases

### Publishing Feeds

- Share curated link collections with your team
- Syndicate your bookmarks to other platforms
- Create public reading lists
- Integrate your bookmarks into news aggregators

### Consuming Feeds

- Stay updated with your favorite blogs and news sites
- Aggregate content from multiple sources
- Build a personal knowledge base from RSS sources
- Archive important content automatically
