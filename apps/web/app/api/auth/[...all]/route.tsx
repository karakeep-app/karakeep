import { auth } from "@/server/auth";

function handler(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/callback/custom") {
    url.pathname = "/api/auth/oauth2/callback/custom";
    request = new Request(url, request);
  }
  return auth.handler(request);
}

export { handler as GET, handler as POST };
