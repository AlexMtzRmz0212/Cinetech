import { NextResponse } from "next/server";

export function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  return NextResponse.json({ error: message }, { status });
}
