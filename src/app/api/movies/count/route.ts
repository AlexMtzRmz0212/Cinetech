import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { listAllMovies } from "@/lib/notion/movies";

/** Owner only (behind the gate): how many movies the library holds, for the header. */
export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.has("fresh");
    const movies = await listAllMovies({ fresh });
    return NextResponse.json({ total: movies.length }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
