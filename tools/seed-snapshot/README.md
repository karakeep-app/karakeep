# Seed snapshots

Generates the data dirs in `snapshots/`. The dev env (`pnpm dev:worktree`)
applies one of them, and they double as upgrade fixtures: each one is a real
database written by a released Karakeep version, so migrating it to HEAD shows
whether a user on that release can upgrade.

## Generating

```sh
# From a released image (ghcr.io/karakeep-app/karakeep:<version>)
pnpm seed:snapshot --release 0.34.1

# From a local build of the working tree
pnpm seed:snapshot
```

Release snapshots are written to `snapshots/seed-data-v<version>.{tar.gz,json}`,
local builds to `snapshots/seed-data-<timestamp>.{tar.gz,json}`. The JSON
manifest lists the seeded users, their password, and what was created for each.

The generator seeds every release through the current tRPC client, so it may
only use procedures and inputs that exist in the oldest release in
`snapshots/`. Releases before 0.34 have no better-auth, so users are signed up
through the legacy `users.create` procedure there.

Don't regenerate or delete a release snapshot: they're fixtures for upgrades
from that release. Add one for each new release instead.

## Applying

```sh
pnpm seed:apply                                           # the newest version
pnpm seed:apply --snapshot seed-data-v0.32.0.tar.gz --force  # a specific one
```
