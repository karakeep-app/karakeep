---
name: dev-env
description: Run the Karakeep dev environment (web + workers) inside a git worktree and log in as a seeded user. Use when asked to start/run the app, verify a change in the browser, take a screenshot of the web UI, or when the dev server fails to boot (port conflicts, login redirects to another worktree, stale migrations, EMFILE watcher loops, tsx EPERM).
---

# Running the Karakeep dev env in a worktree

Many worktrees run on this machine at the same time, often each with its own dev server. `pnpm dev:worktree` (`scripts/dev-worktree.sh`) handles the resulting conflicts. Use it rather than `pnpm web` / `pnpm workers`.

## 1. Start it

Run from the worktree root, in the background (it doesn't return until stopped):

```sh
# run_in_background: true
pnpm dev:worktree >| $TMPDIR/karakeep-$(basename $PWD)-dev.out 2>&1
```

Then wait for it to report readiness:

```sh
for i in $(seq 1 150); do grep -qE "is ready|exited|didn't become" $TMPDIR/karakeep-$(basename $PWD)-dev.out && break; sleep 2; done; tail -20 $TMPDIR/karakeep-$(basename $PWD)-dev.out
```

The script:

1. Sets up only the pieces that are missing: runs `pnpm install`, writes `.env` (random `NEXTAUTH_SECRET`, absolute `DATA_DIR`), symlinks `.env` into `apps/web`, `apps/workers` and `packages/db`, and applies the seed snapshot into `data/`.
2. Migrates the main DB and the queue DB. The seed snapshot is older than HEAD, so this always runs.
3. Picks the first free port in 3100–3199 and sets `NEXTAUTH_URL` to match.
4. Starts the workers, then `next dev` with `WATCHPACK_POLLING=true`, and waits until `/signin` returns 200.
5. Prints the URL, the seed users, and the log paths (`$TMPDIR/karakeep-dev-<worktree>/{web,workers}.log`).

Overrides: `PORT=3105`, `DEV_HOST=<host>` (see step 3), and `WATCHPACK_POLLING=false`. `pnpm dev:worktree setup` does steps 1–2 without starting anything.

Web changes hot-reload. Worker changes don't: restart the script.

## 2. Stop it

Stop the background task (TaskStop). The script stops both services on exit. Don't touch processes from other worktrees; to check which worktree owns a process, run `lsof -a -p <pid> -d cwd`.

## 3. Log in

Seed users (all share the password `test1234`):

| Email | Role | Data |
| --- | --- | --- |
| `test1@example.com` | admin | 20 bookmarks, 3 tags, 2 manual + 2 smart lists |
| `test2@example.com` | user | 4 bookmarks, 3 tags, 2 manual + 2 smart lists |
| `test3@example.com` | user | empty |

Login flow with any browser automation tool:

1. Navigate to `http://localhost:$PORT/signin`.
2. Type the email into `input[type='email']` and the password into `input[type='password']`, then press Enter.
3. Wait for the URL to contain `/dashboard` and the page to show `Seed snapshot bookmark`.

Browser gotchas:

- **The browser must use the host in `NEXTAUTH_URL`.** If your browser tool reaches the app through something other than `localhost`, such as a LAN IP like `http://10.0.10.13:3100`, restart with `DEV_HOST=<that host>`. Otherwise sign-in goes to the wrong place, and Next blocks HMR and fonts for that origin. The same applies to `127.0.0.1`.
- **Cookies are per host, not per port.** Worktrees share cookies. With the per-worktree random secret, another worktree's session cookie is rejected: you land on `/signin`, and the web log shows `JWT_SESSION_ERROR` until you log in. That's expected. If `.env` has a shared secret such as `test1234`, another worktree's session is valid on yours, so open `/logout` first.
- The dashboard's accessibility tree is large. If your screenshot tool returns it with the image, save the snapshot to a file and read only the PNG.

## 4. Not running in dev

- **Meilisearch**: without `MEILI_ADDR`, search is disabled. Start it with `docker run -p 7700:7700 getmeili/meilisearch:v1.41.0` and set `MEILI_ADDR=http://127.0.0.1:7700` only if you need search. Port 7700 may already belong to another worktree's container.
- **Crawling**: the workers run in "browserless mode" with no `BROWSER_WEB_URL`. The seed data is already crawled, so this only matters for newly added links.
- **Inference**: no `OPENAI_API_KEY`, so no auto-tagging.

## 5. Troubleshooting and running pieces by hand

- **`listen EPERM ... tsx-*/*.pipe`**: the tsx CLI (`pnpm db:migrate`, `pnpm workers`, `pnpm seed:apply`) opens an IPC socket that the Claude Code sandbox blocks. Run the file through node's loader instead, e.g. `(cd packages/db && node --import tsx migrate.ts)`. The script already does this.
- **`EMFILE: too many open files, watch`, then `.next/dev` "was deleted" and endless restarts**: native file watching is blocked in the sandbox. Keep `WATCHPACK_POLLING=true`.
- **A stray `packages/db/db.db`**: migrations ran with an empty `DATA_DIR`. Scripts must `import "dotenv/config"` before `@karakeep/shared/config`, which parses `process.env` at import time. Delete the stray file and re-run.
- **Jobs never run / queue errors**: `queue.db` needs `pnpm db:migrate:queue` (or `(cd apps/workers && node --import tsx scripts/migrateQueue.ts)`). The workers also migrate it on startup; the web app never does.
- **Reset the data**: stop the script, then run `(cd tools/seed-snapshot && node --import tsx src/apply.ts --force)`.
- **Never copy `.env` or `data/` from the main checkout**: the seed gives every worktree the same known state.
- **`$TMPDIR` is shared by all agent sessions**: generic names like `web.log` collide with other worktrees, and zsh `noclobber` refuses to overwrite them. Put the worktree name in log file names and use `>|`.
