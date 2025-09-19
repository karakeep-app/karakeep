# Database Migrations

- The database schema lives in `packages/db/schema.ts`.
- Changing the schema, requires a migration.
- You can generate the migration by running `pnpm drizzle-kit generate:sqlite` in the `packages/db` dir.
- You can then apply the migration by running `pnpm run migrate`.


## Drizzle Studio

You can start the drizzle studio by running `pnpm db:studio` in the root of the repo.
