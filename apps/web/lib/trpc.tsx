"use client";

import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

export const api = createTRPCReact<AppRouter>();
