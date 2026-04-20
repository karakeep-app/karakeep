# Community Projects

This page lists community projects that are built around Karakeep, but not officially supported by the development team.

:::warning
This list comes with no guarantees about security, performance, reliability, or accuracy. Use at your own risk.
:::

### Raycast Extension

_By [@luolei](https://github.com/foru17)._

A user-friendly Raycast extension that seamlessly integrates with Karakeep, bringing powerful bookmark management to your fingertips. Quickly save, search, and organize your bookmarks, texts, and images—all through Raycast's intuitive interface.

Get it [here](https://www.raycast.com/luolei/karakeep).

### Alfred Workflow

_By [@yinan-c](https://github.com/yinan-c)_

An Alfred workflow to quickly hoard stuff or access your hoarded bookmarks!

Get it [here](https://www.alfredforum.com/topic/22528-hoarder-workflow-for-self-hosted-bookmark-management/).

### Obsidian Plugin

_By [@jhofker](https://github.com/jhofker)_

An Obsidian plugin that syncs your Karakeep bookmarks with Obsidian, creating markdown notes for each bookmark in a designated folder.

Get it [here](https://github.com/jhofker/obsidian-hoarder/), or install it directly from Obsidian's community plugin store ([link](https://obsidian.md/plugins?id=hoarder-sync)).

### Telegram Bot

_By [@Madh93](https://github.com/Madh93)_

A Telegram Bot for saving bookmarks to Karakeep directly through Telegram.

Get it [here](https://github.com/Madh93/karakeepbot).

### Hoarder's Pipette

_By [@DanSnow](https://github.com/DanSnow)_

A chrome extension that injects karakeep's bookmarks into your search results.

Get it [here](https://dansnow.github.io/hoarder-pipette/guides/installation/).

### Karakeep-Python-API

_By [@thiswillbeyourgithub](https://github.com/thiswillbeyourgithub/)_

A python package to simplify access to the karakeep API. Can be used as a library or from the CLI. Aims for feature completeness and high test coverage but do check its feature matrix before relying too much on it.

Its repository also hosts the [Community Script](https://github.com/thiswillbeyourgithub/karakeep_python_api/tree/main/community_scripts), for example:

| Community Script | Description | Documentation |
|----------------|-------------|---------------|
| **Karakeep-Time-Tagger** | Automatically adds time-to-read tags (`0-5m`, `5-10m`, etc.) to bookmarks based on content length analysis. Includes systemd service and timer files for automated periodic execution. | [`Link`](https://github.com/thiswillbeyourgithub/karakeep_python_api/tree/main/community_scripts/karakeep-time-tagger) |
| **Karakeep-List-To-Tag** | Converts a Karakeep list into tags by adding a specified tag to all bookmarks within that list. | [`Link`](https://github.com/thiswillbeyourgithub/karakeep_python_api/tree/main/community_scripts/karakeep-list-to-tag) |
| **Omnivore2Karakeep-Highlights** | Imports highlights from Omnivore export data to Karakeep, with intelligent position detection and bookmark matching. Supports dry-run mode for testing. | [`Link`](https://github.com/thiswillbeyourgithub/karakeep_python_api/tree/main/community_scripts/omnivore2karakeep-highlights) |


Get it [here](https://github.com/thiswillbeyourgithub/karakeep_python_api).

### FreshRSS_to_Karakeep

_By [@thiswillbeyourgithub](https://github.com/thiswillbeyourgithub/)_

A python script to automatically create Karakeep bookmarks from your [FreshRSS](https://github.com/FreshRSS/FreshRSS) *favourites/saved* RSS item. Made to be called periodically. Based on the community project `Karakeep-Python-API` above, by the same author.

Get it [here](https://github.com/thiswillbeyourgithub/freshrss_to_karakeep).

### karakeep-sync
_By [@sidoshi](https://github.com/sidoshi/)_

Sync links from Hacker News upvotes, Reddit Saves to Karakeep for centralized bookmark management.

Get it [here](https://github.com/sidoshi/karakeep-sync)

### Home Assistant Integration

_By [@sli-cka](https://github.com/sli-cka)_

A custom integration that brings Karakeep data into Home Assistant. It exposes your Karakeep statistics data (like lists, bookmarks, tag, etc.) as Home Assistant entities, enabling dashboards, automations, and notifications based on your Karakeep data.

Get it [here](https://github.com/sli-cka/karakeep-homeassistant)
