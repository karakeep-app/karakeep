# Karakeep Chrome

This directory defines Karakeep's headless Chrome image: Google Chrome stable
(Debian's Chromium on arm64, which Google doesn't ship Linux builds for)
running in Chrome's new headless mode, with the DevTools endpoint exposed on
port 9222.

It deliberately ships full Chrome rather than the much smaller Chrome Headless
Shell: in A/B tests against bot-protected sites, the headless shell was blocked
far more often (it leaks CDP automation even with a patched client), and so,
to a lesser extent, was the Chromium build.

## Sandbox

Chrome runs as `nobody` with `no_new_privs` set, and the image has no setuid or
setgid binaries. Chrome's own sandbox (which isolates every renderer) is off by
default because it needs unprivileged user namespaces, which Docker's default
seccomp profile blocks. To turn it on, set `KARAKEEP_CHROME_SANDBOX=true` and
run the container where user namespaces are allowed, e.g. on Docker:

```yaml
chrome:
  environment:
    KARAKEEP_CHROME_SANDBOX: "true"
  security_opt:
    - seccomp=unconfined
```

Some hosts also restrict user namespaces themselves. Lifting that is a
host-wide change: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
on Ubuntu 23.10+, or `kernel.unprivileged_userns_clone=1` on older Debian.

If the sandbox can't start, Chrome exits instead of running without it.

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
