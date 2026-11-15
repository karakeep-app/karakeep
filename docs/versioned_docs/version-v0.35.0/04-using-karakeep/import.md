---
sidebar_position: 8
slug: import
---

# Import your library


Karakeep supports importing bookmarks using the Netscape HTML Format, Pocket's new CSV format & Omnivore's JSONs. Titles, tags and addition date will be preserved during the import. An automatically created list will contain all the imported bookmarks.

:::info
All the URLs in the bookmarks file will be added automatically, you will not be able to pick and choose which bookmarks to import!
:::

## Import from Chrome

- Open Chrome and go to `chrome://bookmarks`
- Click on the three dots on the top right corner and choose `Export bookmarks`
- This will download an html file with all of your bookmarks.
- To import the bookmark file, go to the settings and click "Import Bookmarks from HTML file".

## Import from Firefox
- Open Firefox and click on the menu button (☰) in the top right corner.
- Navigate to Bookmarks > Manage bookmarks (or press Ctrl + Shift + O / Cmd + Shift + O to open the Bookmarks Library).
- In the Bookmarks Library, click the Import and Backup button at the top. Select Export Bookmarks to HTML... to save your bookmarks as an HTML file.
- To import a bookmark file, go back to the Import and Backup menu, then select Import Bookmarks from HTML... and choose your saved HTML file.

## Import from Pocket

- Go to the [Pocket export page](https://getpocket.com/export) and follow the instructions to export your bookmarks.
- Pocket after a couple of minutes will mail you a zip file with all the bookmarks.
- Unzip the file and you'll get a CSV file.
- To import the bookmark file, go to the settings and click "Import Bookmarks from Pocket export".

## Import from Omnivore

- Follow Omnivore's [documentation](https://docs.omnivore.app/using/exporting.html) to export your bookmarks.
- This will give you a zip file with all your data.
- The zip file contains a lot of JSONs in the format `metadata_*.json`. You can either import every JSON file manually, or merge the JSONs into a single JSON file and import that.
- To  merge the JSONs into a single JSON file, you can use the following command in the unzipped directory: `jq -r '.[]' metadata_*.json | jq -s > omnivore.json` and then import the `omnivore.json` file. You'll need to have the [jq](https://github.com/jqlang/jq) tool installed.

## Import using the CLI

:::warning
Importing bookmarks using the CLI requires some technical knowledge and might not be very straightforward for non-technical users. Don't hesitate to ask questions in github discussions or discord though.
:::

If you can get your bookmarks in a text file with one link per line, you can use the following command to import them using the [karakeep cli](../05-integrations/02-command-line.md):

```
while IFS= read -r url; do
    karakeep --api-key "<KEY>" --server-addr "<SERVER_ADDR>" bookmarks add --link "$url"
done < all_links.txt
```
