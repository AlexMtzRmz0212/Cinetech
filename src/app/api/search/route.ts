import { NextResponse } from "next/server";
import { searchTmdb } from "@/lib/providers/tmdb";
import { fail } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ results: [] });
    const year = Number(searchParams.get("year")) || null;
    return NextResponse.json({ results: await searchTmdb(q, year) });
  } catch (error) {
    return fail(error);
  }
}
