import serverConfig from "@karakeep/shared/config";

const API_CATALOG_PROFILE = "https://www.rfc-editor.org/info/rfc9727";
const API_DOCUMENTATION_URL = "https://docs.karakeep.app/api";
const OPENAPI_SPEC_URL =
  "https://raw.githubusercontent.com/karakeep-app/karakeep/refs/heads/main/packages/open-api/karakeep-openapi-spec.json";

function apiCatalogUrl() {
  return `${serverConfig.publicUrl}/.well-known/api-catalog`;
}

function responseHeaders() {
  return {
    "Cache-Control": "public, max-age=3600",
    "Content-Type": `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
    Link: `<${apiCatalogUrl()}>; rel="api-catalog"`,
  };
}

export function GET() {
  const apiBaseUrl = `${serverConfig.publicUrl}/api/v1`;
  const catalog = {
    linkset: [
      {
        anchor: apiCatalogUrl(),
        item: [{ href: apiBaseUrl }],
      },
      {
        anchor: apiBaseUrl,
        "service-desc": [
          {
            href: OPENAPI_SPEC_URL,
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: API_DOCUMENTATION_URL,
            type: "text/html",
          },
        ],
        status: [
          {
            href: `${serverConfig.publicUrl}/api/health`,
            type: "application/json",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog), {
    headers: responseHeaders(),
  });
}

export function HEAD() {
  return new Response(null, {
    headers: responseHeaders(),
  });
}
