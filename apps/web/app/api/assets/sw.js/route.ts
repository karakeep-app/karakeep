import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const file = await fs.readFile(
    path.join(process.cwd(), "public", "replay", "sw.js"),
  );
  return new NextResponse(file, {
    headers: { "Content-Type": "application/javascript" },
  });
}
