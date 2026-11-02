# Karakeep Chrome

This directory defines Karakeep's headless Chrome image: Google Chrome stable
(Debian's Chromium on arm64, which Google doesn't ship Linux builds for)
running in Chrome's new headless mode, with the DevTools endpoint exposed on
port 9222.

It deliberately ships full Chrome rather than the much smaller Chrome Headless
Shell: in A/B tests against bot-protected sites, the headless shell was blocked
far more often (it leaks CDP automation even with a patched client), and so,
to a lesser extent, was the Chromium build.

## Testing locally

Run Karakeep's e2e suite, which builds this image through its Compose file and
exercises it through the real crawler:

```sh
pnpm --filter @karakeep/e2e_tests test
```

The crawler tests cover Playwright compatibility, context creation, local-page
navigation, JavaScript execution, request routing, the CDP redirect guard,
screenshots, and PDFs. The image workflow verifies that the image builds on both
native target architectures before publishing.

## Updating the image

Renovate (`renovate.json` at the repo root) opens a pull request whenever a new
Google Chrome stable is out or the pinned Debian base image digest changes. Its
Chrome version comes from Google's version history API, and the pull request
updates `GOOGLE_CHROME_VERSION` in both `Dockerfile` and
`.github/workflows/chrome.yml`. The arm64 image installs Debian trixie's
current Chromium, so every rebuild also picks up its security updates.

1. Let both native architecture build jobs pass on the pull request (Renovate's,
   or yours for a manual change). A brand new Chrome version can take a moment
   to show up in Google's package pool
   (`https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/`);
   rerun the jobs if the download failed.
2. After merge, manually dispatch the `Chrome Image` workflow from `main`.
   Publishing is gated by the `chrome-production` GitHub environment.

Every publish gets a new `<chrome version>-r<N>` tag. The workflow picks the
first unused revision, starting at `-r1` for each browser version, so neither
browser bumps nor packaging-only changes need to touch it. Published versioned
tags are never reused or mutated. Each release also moves the `latest` and
`release` tags to the newly published manifest. They currently move together
but may use separate promotion policies in the future.
