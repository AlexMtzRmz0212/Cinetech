import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, gateEnabled, verifySession } from "@/lib/auth";

/** Tells the header whether to show the owner tools. Visitors just get { owner: false }. */
export async function GET() {
  const owner = !gateEnabled() || (await verifySession((await cookies()).get(COOKIE)?.value));
  return NextResponse.json({ owner }, { headers: { "cache-control": "no-store" } });
}
