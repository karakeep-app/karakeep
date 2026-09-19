import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/server/auth";
import { db } from "@karakeep/db";
import config from "@karakeep/shared/config";
import { completeGithubConnection } from "@karakeep/trpc/models/githubStarsConnection";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  const destination = new URL("/settings/github-stars", config.publicUrl);
  if (!session?.user)
    return new Response("Sign in to Karakeep and start the connection again.", {
      status: 401,
    });
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  try {
    if (!code || !state || code.length > 1024 || state.length > 128)
      throw new Error("Invalid callback");
    await completeGithubConnection(db, session.user.id, state, code);
    destination.searchParams.set("github", "connected");
  } catch {
    destination.searchParams.set("github", "failed");
  }
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
