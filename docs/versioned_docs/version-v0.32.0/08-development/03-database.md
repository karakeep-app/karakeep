# Database Migrations

- The database schema lives in `packages/db/schema.ts`.
- Changing the schema, requires a migration.
- You can generate the migration by running `pnpm run db:generate --name description_of_schema_change` in the root dir.
- You can then apply the migration by running `pnpm run db:migrate`.

## Drizzle Studio

You can start the drizzle studio by running `pnpm run db:studio` in the root of the repo.
