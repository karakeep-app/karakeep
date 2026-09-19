import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

export type TrpcClient = ReturnType<typeof getTrpcClient>;

export function getTrpcClient(apiKey?: string) {
  if (!process.env.KARAKEEP_PORT) {
    throw new Error("KARAKEEP_PORT is not set. Did you start the containers?");
  }

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: `http://localhost:${process.env.KARAKEEP_PORT}/api/trpc`,
        headers() {
          return {
            authorization: apiKey ? `Bearer ${apiKey}` : undefined,
          };
        },
      }),
    ],
  });
}

// Signs up through better-auth's endpoint, the same way the web app does.
export async function signUpUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const baseUrl = `http://localhost:${process.env.KARAKEEP_PORT}`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Node's fetch sends Sec-Fetch-* headers but no Origin, which
      // better-auth's CSRF protection rejects. Browsers always send it.
      Origin: baseUrl,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign up ${input.email}: ${response.status} ${await response.text()}`,
    );
  }
}
