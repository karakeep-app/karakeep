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

1. Pick a Google Chrome stable version that's still available in Google's
   package pool
   (`https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/`).
2. Update `GOOGLE_CHROME_VERSION` in both `Dockerfile` and
   `.github/workflows/chrome.yml`, and reset the image revision in the
   workflow. The arm64 image installs Debian trixie's current Chromium.
3. Open a pull request and let both native architecture build jobs pass.
4. After merge, manually dispatch the `Chrome Image` workflow from `main`.
   Publishing is gated by the `chrome-production` GitHub environment.

Use `-r1` for a new browser version. Increment the revision for a packaging-only
change. Never reuse or mutate a published versioned tag. Each release also moves
the `latest` and `release` tags to the newly published manifest. They currently
move together but may use separate promotion policies in the future.
