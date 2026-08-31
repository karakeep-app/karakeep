const CHANGE_PASSWORD_PATH = "/settings/info#security";

export function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: CHANGE_PASSWORD_PATH,
    },
  });
}
