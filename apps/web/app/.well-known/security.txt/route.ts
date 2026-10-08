import serverConfig from "@karakeep/shared/config";

const SECURITY_TXT_EXPIRY = "2027-08-01T00:00:00Z";

export function GET() {
  const canonicalUrl = new URL(
    "/.well-known/security.txt",
    serverConfig.publicUrl,
  );
  const lines = [
    "Contact: mailto:security@karakeep.app",
    `Expires: ${SECURITY_TXT_EXPIRY}`,
    ...(canonicalUrl.protocol === "https:"
      ? [`Canonical: ${canonicalUrl.toString()}`]
      : []),
    "Preferred-Languages: en",
  ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
