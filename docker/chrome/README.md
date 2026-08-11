# Karakeep Chrome

This directory defines Karakeep's minimal Chrome Headless Shell image.

This image is built on top of (https://github.com/chromedp/docker-headless-shell).

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

1. Choose an exact `chromedp/headless-shell` version that supports both target
   architectures.
2. Resolve its multi-architecture index digest with
   `docker buildx imagetools inspect`.
3. Update the version and digest in `Dockerfile` and the version and image
   revision in `.github/workflows/chrome.yml`.
4. Open a pull request and let both native architecture build jobs pass.
5. After merge, manually dispatch the `Chrome Image` workflow from `main`.
   Publishing is gated by the `chrome-production` GitHub environment.

Use `-r1` for a new browser version. Increment the revision for a packaging-only
change. Never reuse or mutate a published versioned tag. Each release also moves
the `latest` and `release` tags to the newly published manifest. They currently
move together but may use separate promotion policies in the future.
