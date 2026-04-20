# RSS Feeds

Karakeep offers RSS feed integration, allowing you to both consume RSS feeds from external sources and publish your lists as RSS feeds for others to subscribe to.

## Publishing RSS Feeds

You can publish any of your lists as an RSS feed, making it easy to share your bookmarks with others or integrate them into RSS readers.

### Enabling RSS for a List

1. Navigate to one of your lists
2. Click on the list settings (three dots menu)
3. Toggle the "RSS Feed" switch to enable it
4. Copy the generated RSS feed URL

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
- Duplicate entries are automatically detected and skipped
