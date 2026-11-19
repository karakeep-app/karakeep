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
give the container a seccomp profile that allows them.
[`seccomp.json`](seccomp.json) is Docker's default profile with only that
added. Download it next to your compose file and point the container at it:

```yaml
chrome:
  environment:
    KARAKEEP_CHROME_SANDBOX: "true"
  security_opt:
    - seccomp=./seccomp.json
```

The profile is Docker's default
([moby/profiles](https://github.com/moby/profiles) `seccomp/v0.2.4`, Apache
2.0) with two changes, both for processes without `CAP_SYS_ADMIN`, which
Chrome doesn't have:

- `clone` may create new user, PID and network namespaces. Docker's default
  allows it no new namespaces.
- `unshare` may create a new user namespace. Docker's default doesn't allow
  `unshare` at all.

Everything else Docker's default refuses, the profile still refuses. The
trade-off is that every process in the container can now create user
namespaces, which is kernel attack surface Docker keeps closed by default.
Here that's Chrome alone, running as `nobody` with `no_new_privs`, and it's
what lets Chrome put each renderer in its own namespaces under its seccomp-bpf
filter. `seccomp=unconfined` also works, but it lifts every seccomp
restriction, not just these two.

Some hosts also restrict user namespaces themselves. Lifting that is a
host-wide change: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
on Ubuntu 23.10+, or `kernel.unprivileged_userns_clone=1` on older Debian.

If the sandbox can't start, Chrome exits instead of running without it. To
check it's on, open `chrome://sandbox` through the DevTools endpoint: it should
end with "You are adequately sandboxed."

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
