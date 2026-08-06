# Firefox-based stealth backend (proposal)

> Status: Draft proposal
> Created: 2026-05-27
> Tracking discussion: TBD

## Goal

Optional Firefox-based stealth backend for the crawler worker, parallel to the current `chromium` plus `puppeteer-extra-plugin-stealth` setup. Selected via env, no change to defaults.

## Motivation

The crawler today wires `playwright-extra` + `StealthPlugin()` at the top of `apps/workers/workers/crawlerWorker.ts`. The stealth plugin patches a fixed set of JS-visible signals (`navigator.webdriver`, plugin shape, WebGL parameter overrides, etc) by injecting overrides into every context. Cloudflare and current anti-bot WAFs increasingly flag the override surface itself (descriptor configurability, `.toString()` mismatches, prototype mutation), which is why the existing approach gets blocked on the sites tracked in #2381, #2423, #2073, and is the underlying reason behind the #2593 Flaresolver request.

A Firefox-based fallback with fingerprint patches at the C++ source code level avoids the JS-shim detection surface entirely, because the spoofed values come back through the normal Gecko paths.

## Proposed change

Add a `CRAWLER_BROWSER_ENGINE` env value `invisible-firefox` recognized by `crawlerWorker.ts`. When set, the worker downloads the binary from feder-cr/invisible_firefox releases (MPL-2.0, same license as Firefox upstream) and calls `firefox.launch({ executablePath, firefoxUserPrefs })` instead of the chromium+stealth path. The patched binary and prefs are documented at feder-cr/invisible_playwright.

The Python wrapper is feder-cr/invisible_playwright. For karakeep's Node worker only the binary plus a small prefs map is needed — a Node helper package is on the roadmap for a single-line install if there's interest.

## Out of scope

No change to default backend. No change to existing `playwright-extra` + `StealthPlugin()` path. No change to the adblocker, the metascraper plugins, or the readability extraction.

## Maintenance

Issues against the backend route to feder-cr/invisible_playwright. Only ask of this repo would be a small branch in `crawlerWorker.ts` that resolves to a different `launchBrowser()` when the env is set, plus a config docstring update.
