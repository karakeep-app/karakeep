# Karakeep Benchmarks

This package spins up a production-like Karakeep stack in Docker, seeds it with a sizeable dataset, then benchmarks a handful of high-signal APIs.

## Usage

```bash
pnpm --filter @karakeep/benchmarks bench
```

The command will:

- Start the docker-compose stack on a random free port
- Create a dedicated benchmark user, tags, lists, and hundreds of bookmarks
- Run a suite of benchmarks (create, list, search, and list metadata calls)
- Print a table with ops/sec and latency percentiles
- Tear down the containers and capture logs (unless you opt out)

## Configuration

Control the run via environment variables:

- `BENCH_BOOKMARKS` (default `400`): number of bookmarks to seed
- `BENCH_TAGS` (default `25`): number of tags to seed
- `BENCH_LISTS` (default `6`): number of lists to seed
- `BENCH_SEED_CONCURRENCY` (default `12`): concurrent seeding operations
- `BENCH_TIME_MS` (default `1000`): time per benchmark case
- `BENCH_WARMUP_MS` (default `300`): warmup time per case
- `BENCH_NO_BUILD=1`: reuse existing docker images instead of rebuilding
- `BENCH_KEEP_CONTAINERS=1`: leave the stack running after the run

The stack uses the package-local `docker-compose.yml` and serves a tiny HTML fixture from `setup/html`.
