"use client";

import type { PropsWithChildren } from "react";
import type { auth } from "@/server/auth";
import { createContext, createElement, useContext } from "react";
import { TURNSTILE_TOKEN_HEADER } from "@/lib/auth/constants";
import { createAuthClient } from "better-auth/react";
import {
  genericOAuthClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";

export interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: "admin" | "user";
  };
  expires: string;
}

const authClient = createAuthClient({
  plugins: [genericOAuthClient(), inferAdditionalFields<typeof auth>()],
});

type ClientSessionData = NonNullable<
  ReturnType<typeof authClient.useSession>["data"]
>;

function toSession(data: ClientSessionData): Session {
  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image,
      role: data.user.role === "admin" ? "admin" : "user",
    },
    expires: new Date(data.session.expiresAt).toISOString(),
  };
}

// The session resolved on the server during SSR. It's used until the client
// side session fetch completes, so that client components don't render as
// logged out (and redirect away) on the initial page load.
const InitialSessionContext = createContext<Session | null>(null);

export function SessionProvider({
  children,
  session,
}: PropsWithChildren<{ session?: Session | null }>) {
  return createElement(
    InitialSessionContext.Provider,
    { value: session ?? null },
    children,
  );
}

export function useSession() {
  const initialSession = useContext(InitialSessionContext);
  const session = authClient.useSession();
  if (session.isPending) {
    return { ...session, data: initialSession };
  }
  return { ...session, data: session.data ? toSession(session.data) : null };
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  // better-auth's error code, e.g. "EMAIL_NOT_VERIFIED".
  code?: string;
}

function toAuthResult(result: {
  error: { message?: string; code?: string } | null;
}): AuthResult {
  return {
    ok: !result.error,
    error: result.error?.message,
    code: result.error?.code,
  };
}

export async function signIn(
  provider: string,
  options: {
    email?: string;
    password?: string;
    callbackUrl?: string;
  } = {},
): Promise<AuthResult> {
  if (provider === "credentials") {
    if (!options.email || options.password === undefined) {
      return { ok: false, error: "Email and password are required" };
    }
    return toAuthResult(
      await authClient.signIn.email({
        email: options.email,
        password: options.password,
        callbackURL: options.callbackUrl,
      }),
    );
  }

  return toAuthResult(
    await authClient.signIn.oauth2({
      providerId: provider,
      callbackURL: options.callbackUrl ?? "/",
      errorCallbackURL: "/signin",
    }),
  );
}

export async function signOut(): Promise<AuthResult> {
  return toAuthResult(await authClient.signOut());
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  callbackUrl?: string;
  turnstileToken?: string;
}): Promise<AuthResult & { signedIn: boolean }> {
  const result = await authClient.signUp.email(
    {
      name: input.name,
      email: input.email,
      password: input.password,
      callbackURL: input.callbackUrl,
    },
    {
      headers: input.turnstileToken
        ? { [TURNSTILE_TOKEN_HEADER]: input.turnstileToken }
        : undefined,
    },
  );
  return {
    ...toAuthResult(result),
    // No session is created when the email address needs to be verified first.
    signedIn: !!result.data?.token,
  };
}

export async function sendVerificationEmail(input: {
  email: string;
  callbackUrl?: string;
}): Promise<AuthResult> {
  return toAuthResult(
    await authClient.sendVerificationEmail({
      email: input.email,
      callbackURL: input.callbackUrl,
    }),
  );
}

export async function verifyEmail(token: string): Promise<AuthResult> {
  return toAuthResult(await authClient.verifyEmail({ query: { token } }));
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  return toAuthResult(await authClient.requestPasswordReset({ email }));
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<AuthResult> {
  return toAuthResult(await authClient.resetPassword(input));
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AuthResult> {
  return toAuthResult(
    await authClient.changePassword({
      ...input,
      revokeOtherSessions: true,
    }),
  );
}
