import { auth } from "@/server/auth";

function handler(request: Request) {
  return auth.handler(request);
}

export { handler as GET, handler as POST };
