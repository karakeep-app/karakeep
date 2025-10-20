import serverConfig from "@karakeep/shared/config";
import { NextRequest, NextResponse } from "next/server";

const targetPath = `${serverConfig.publicApiUrl}/auth/oauth2/callback/custom`;

function buildRedirectUrl(request: NextRequest) {
  const sourceUrl = new URL(request.url);
  const destination = new URL(targetPath);
  destination.search = sourceUrl.search;
  return destination;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(buildRedirectUrl(request), { status: 307 });
}

export function POST(request: NextRequest) {
  return NextResponse.redirect(buildRedirectUrl(request), { status: 307 });
}
