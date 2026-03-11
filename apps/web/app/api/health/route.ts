// Dedicated health endpoint that bypasses the auth middleware in [[...route]]/route.ts.
// Without this, every healthcheck call triggers next-auth init() which allocates
// ~14 closure objects per request and causes a gradual memory leak (GitHub issue #2344).
export const runtime = "nodejs";

export function GET() {
  return Response.json({ status: "ok", message: "Web app is working" });
}
