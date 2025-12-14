# Directory Structure

## Apps

| Directory                | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `apps/web`               | The main web app                                       |
| `apps/workers`           | The background workers logic                           |
| `apps/mobile`            | The react native based mobile app                      |
| `apps/browser-extension` | The browser extension                                  |
| `apps/landing`           | The landing page of [karakeep.app](https://karakeep.app) |

## Shared Packages

| Directory         | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `packages/db`     | The database schema and migrations                                           |
| `packages/trpc`   | Where most of the business logic lies built as TRPC routes                   |
| `packages/shared` | Some shared code between the different apps (e.g. loggers, configs, assetdb) |

## Toolings

| Directory            | Description             |
| -------------------- | ----------------------- |
| `tooling/typescript` | The shared tsconfigs    |
| `tooling/eslint`     | ESlint configs          |
| `tooling/prettier`   | Prettier configs        |
| `tooling/tailwind`   | Shared tailwind configs |
