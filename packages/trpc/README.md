# @karakeep/trpc

TypeScript tRPC router and type definitions for the Karakeep API.

This package exports the complete tRPC router type definitions, allowing you to build type-safe clients for the Karakeep API using tRPC.

## Installation

```bash
npm install @karakeep/trpc
```

## Usage

### Using with tRPC Client

This package is primarily used to get type-safe tRPC client access to the Karakeep API:

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@karakeep/trpc/routers/_app';
import superjson from 'superjson';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://your-karakeep-instance.com/api/trpc',
      headers: {
        Authorization: `Bearer YOUR_API_KEY`,
      },
    }),
  ],
  transformer: superjson,
});

// Now you have fully type-safe access to all tRPC procedures
const bookmarks = await client.bookmarks.list.query({ limit: 10 });
```

### Using Context Types

If you're extending the Karakeep backend or creating middleware:

```typescript
import type { Context, AuthedContext } from '@karakeep/trpc';

// Use the context types in your custom procedures
function myCustomMiddleware(opts: { ctx: Context }) {
  // Your middleware logic
}
```

### Using Procedures and Router Builders

```typescript
import { router, authedProcedure, publicProcedure } from '@karakeep/trpc';

// Create custom routers using the same builder functions
const myRouter = router({
  myProcedure: authedProcedure.query(async ({ ctx }) => {
    // ctx.user is guaranteed to exist
    return { userId: ctx.user.id };
  }),
});
```

## What's Included

This package exports:

- **Type Definitions**: `AppRouter` type for full API type safety
- **Context Types**: `Context` and `AuthedContext` interfaces
- **Router Builder**: `router` function for creating tRPC routers
- **Procedures**: `procedure`, `publicProcedure`, `authedProcedure`, and `adminProcedure`
- **Utilities**: `createCallerFactory`, `createRateLimitMiddleware`

## Peer Dependencies

This package requires the following peer dependencies:

- `@trpc/server` (v11.x)
- `zod` (v3.x)
- `superjson` (v2.x)

## Documentation

For full API documentation, visit [docs.karakeep.app](https://docs.karakeep.app).

## License

AGPL-3.0
