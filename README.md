<div align="center">
    <a href="https://github.com/karakeep-app/karakeep/actions/workflows/ci.yml">
        <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/karakeep-app/karakeep/ci.yml" />
    </a>
    <a href="https://github.com/karakeep-app/karakeep/releases">
        <img alt="GitHub Release" src="https://img.shields.io/github/v/release/karakeep-app/karakeep" />
    </a>
    <a href="https://discord.gg/NrgeYywsFh">
        <img alt="Discord" src="https://img.shields.io/discord/1223681308962721802?label=chat%20on%20discord" />
    </a>
    <a href="https://hosted.weblate.org/engage/hoarder/">
        <img src="https://hosted.weblate.org/widget/hoarder/hoarder/svg-badge.svg" alt="Translation status" />
    </a>
</div>

# <img height="50px" src="./screenshots/logo.png" />

Karakeep (previously Hoarder) is a self-hostable bookmark-everything app with a touch of AI for the data hoarders out there.

![homepage screenshot](https://github.com/karakeep-app/karakeep/blob/main/screenshots/homepage.png?raw=true)

## Features

- 🔗 Bookmark links, take simple notes and store images and pdfs.
- ⬇️ Automatic fetching for link titles, descriptions and images.
- 📋 Sort your bookmarks into lists.
- 👥 Collaborate with others on the same list.
- 🔎 Full text search of all the content stored.
- ✨ AI-based (aka chatgpt) automatic tagging and summarization. With supports for local models using ollama!
- 🤖 Rule-based engine for customized management.
- 🎆 OCR for extracting text from images.
- 🔖 [Chrome plugin](https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje) and [Firefox addon](https://addons.mozilla.org/en-US/firefox/addon/karakeep/) for quick bookmarking.
- 📱 An [iOS app](https://apps.apple.com/us/app/karakeep-app/id6479258022), and an [Android app](https://play.google.com/store/apps/details?id=app.hoarder.hoardermobile&pcampaignid=web_share).
- 📰 Auto hoarding from RSS feeds.
- 🔌 REST API and multiple clients.
- 🌐 Multi-language support.
- 🖍️ Mark and store highlights from your hoarded content.
- 🗄️ Full page archival (using [monolith](https://github.com/Y2Z/monolith)) to protect against link rot.
- ▶️ Auto video archiving using [yt-dlp](https://github.com/yt-dlp/yt-dlp).
- ☑️ Bulk actions support.
- 🔐 SSO support.
- 🌙 Dark mode support.
- 💾 Self-hosting first.
- ⬇️ Bookmark importers from Chrome, Pocket, Linkwarden, Omnivore, Tab Session Manager.
- 🔄 Automatic sync with browser bookmarks via [floccus](https://floccus.org/).
- [Planned] Offline reading on mobile, semantic search across bookmarks, ...

**⚠️ This app is under heavy development.**

## Documentation

- [Installation](https://docs.karakeep.app/Installation/docker)
- [Configuration](https://docs.karakeep.app/configuration)
- [Screenshots](https://docs.karakeep.app/screenshots)
- [Security Considerations](https://docs.karakeep.app/security-considerations)
- [Development](https://docs.karakeep.app/Development/setup)

## Demo

You can access the demo at [https://try.karakeep.app](https://try.karakeep.app). Login with the following creds:

```
email: demo@karakeep.app
password: demodemo
```

The demo is seeded with some content, but it's in read-only mode to prevent abuse.

## About the name

The name Karakeep is inspired by the Arabic word "كراكيب" (karakeeb), a colloquial term commonly used to refer to miscellaneous clutter, odds and ends, or items that may seem disorganized but often hold personal value or hidden usefulness. It evokes the image of a messy drawer or forgotten box, full of stuff you can't quite throw away—because somehow, it matters (or more likely, because you're a hoarder!).

## Stack

- [NextJS](https://nextjs.org/) for the web app. Using app router.
- [Drizzle](https://orm.drizzle.team/) for the database and its migrations.
- [NextAuth](https://next-auth.js.org) for authentication.
- [tRPC](https://trpc.io) for client->server communication.
- [Puppeteer](https://pptr.dev/) for crawling the bookmarks.
- [OpenAI](https://openai.com/) because AI is so hot right now.
- [Meilisearch](https://meilisearch.com) for the full content search.

## Why did I build it?

I browse reddit, twitter and hackernews a lot from my phone. I frequently find interesting stuff (articles, tools, etc) that I'd like to bookmark and read later when I'm in front of a laptop. Typical read-it-later apps usecase. Initially, I was using [Pocket](https://getpocket.com) for that. Then I got into self-hosting and I wanted to self-host this usecase. I used [memos](https://github.com/usememos/memos) for those quick notes and I loved it but it was lacking some features that I found important for that usecase such as link previews and automatic tagging (more on that in the next section).

I'm a systems engineer in my day job (and have been for the past 7 years). I didn't want to get too detached from the web development world. I decided to build this app as a way to keep my hand dirty with web development, and at the same time, build something that I care about and use every day.

## Alternatives

- [memos](https://github.com/usememos/memos): I love memos. I have it running on my home server and it's one of my most used self-hosted apps. It doesn't, however, archive or preview the links shared in it. It's just that I dump a lot of links there and I'd have loved if I'd be able to figure which link is that by just looking at my timeline. Also, given the variety of things I dump there, I'd have loved if it does some sort of automatic tagging for what I save there. This is exactly the usecase that I'm trying to tackle with Karakeep.
- [mymind](https://mymind.com/): Mymind is the closest alternative to this project and from where I drew a lot of inspirations. It's a commercial product though.
- [raindrop](https://raindrop.io): A polished open source bookmark manager that supports links, images and files. It's not self-hostable though.
- Bookmark managers (mostly focused on bookmarking links):
    - [Pocket](https://getpocket.com) (Dead): Pocket is what hooked me into the whole idea of read-it-later apps. I used it [a lot](https://blog.mbassem.com/2019/01/27/favorite-articles-2018/). However, I recently got into home-labbing and became obsessed with the idea of running my services in my home server. Karakeep is meant to be a self-hosting first app. Mozilla recently announced that it's shutting down pocket.
    - [Linkwarden](https://linkwarden.app/): An open-source self-hostable bookmark manager that I ran for a bit in my homelab. It's focused mostly on links and supports collaborative collections.
    - [Wallabag](https://wallabag.it): Wallabag is a well-established open source read-it-later app written in php.
    - [Shiori](https://github.com/go-shiori/shiori): Shiori is meant to be an open source pocket clone written in Go.

## Translations

Karakeep uses Weblate for managing translations. If you want to help translate Karakeep, you can do so [here](https://hosted.weblate.org/engage/hoarder/).

## Karakeep Cloud ☁️

If you're not comfortable with self-hosting, you can use our managed Karakeep cloud at [cloud.karakeep.app](https://cloud.karakeep.app). Cloud subscriptions support the development of Karakeep.

## Support

If you're enjoying using Karakeep, drop a ⭐️ on the repo!

<a href="https://www.buymeacoffee.com/mbassem" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Community Channels

- Join us on [Discord](https://discord.gg/NrgeYywsFh).
- Follow us on Twitter: [@karakeep_app](https://x.com/karakeep_app).

## License

Karakeep is licensed under [AGPL-3.0](https://github.com/karakeep-app/karakeep/blob/main/LICENSE) and owned by [Localhost Labs Ltd](https://localhostlabs.co.uk).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=karakeep-app/karakeep&type=Date)](https://star-history.com/#karakeep-app/karakeep&Date)
