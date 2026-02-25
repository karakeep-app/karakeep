# Using Karakeep with SingleFile Extension

Karakeep supports being a destination for the [SingleFile extension](https://github.com/gildas-lormeau/SingleFile). This has the benefit of allowing you to use the singlefile extension to hoard links as you're seeing them in the browser. This is perfect for websites that don't like to get crawled, has annoying cookie banner or require authentication.

## Setup

1. Install the [SingleFile extension](https://github.com/gildas-lormeau/SingleFile).
2. In the extension settings, select `Destinations`.
3. Select `upload to a REST Form API`.
4. In the URL, insert the address: `https://YOUR_SERVER_ADDRESS/api/v1/bookmarks/singlefile`.
5. In the `authorization token` field, paste an API key that you can get from your karakeep settings.
6. Set `data field name` to `file`.
7. Set `URL field name` to `url`.
8. (Optional) Add `?ifexists=MODE` to the URL where MODE is one of `skip`, `overwrite`, `overwrite-recrawl`, `append`, or `append-recrawl`. See "Handling Existing Bookmarks" section below for details.

Now, go to any page and click the singlefile extension icon. Once it's done with the upload, the bookmark should show up in your karakeep instance. Note that the singlefile extension doesn't show any progress on the upload. Given that archives are typically large, it might take 30+ seconds until the upload is done and starts showing up in Karakeep.

## Handling Existing Bookmarks

When uploading a page that already exists in your archive (same URL), you can control the behavior by setting the `ifexists` query parameter in the upload URL. The available modes are:

- `skip` (default): If the bookmark already exists, skip creating a new one
- `overwrite`: Replace existing precrawled archive (only the most recent archive is kept)
- `overwrite-recrawl`: Replace existing archive and queue a recrawl to update content
- `append`: Add new archive version alongside existing ones
- `append-recrawl`: Add new archive and queue a recrawl

To use these modes, append `?ifexists=MODE` to your upload URL, replacing `MODE` with your desired behavior.

For example:  
`https://YOUR_SERVER_ADDRESS/api/v1/bookmarks/singlefile?ifexists=overwrite`


## Recommended settings

In the singlefile extension, you probably will want to change the following settings for better experience:
* Stylesheets > compress CSS content: on
* Stylesheets > group duplicate stylesheets together: on
* HTML content > remove frames: on

Also, you most likely will want to change the default `MAX_ASSET_SIZE_MB` in karakeep to something higher, for example `100`.

:::info
Currently, we don't support screenshots for singlefile uploads, but this will change in the future.
:::

