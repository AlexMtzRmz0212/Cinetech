import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { refreshSchema } from "@/lib/notion/client";
import { createMovie, listAllMovies } from "@/lib/notion/movies";
import { getTmdbMetadata } from "@/lib/providers/tmdb";
import { omdbProvider } from "@/lib/providers/omdb";
import { MovieIndex } from "@/lib/sync/match";
import { emptyMovie, type Status } from "@/lib/types";

export const maxDuration = 60;

/** Owner only: the full library (with page ids) plus the Status options, for editing. */
export async function GET() {
  try {
    const [{ statusOptions }, movies] = await Promise.all([refreshSchema(), listAllMovies({ fresh: true })]);
    return NextResponse.json({ movies, statusOptions });
  } catch (error) {
    return fail(error);
  }
}

/** Add a movie picked from TMDb search: fetch full metadata and create the Notion page. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tmdbId?: number; status?: Status };
    if (!body.tmdbId) return NextResponse.json({ error: "tmdbId is required" }, { status: 400 });

    const meta = await getTmdbMetadata(body.tmdbId);
    if (!meta?.title) return NextResponse.json({ error: "Movie not found on TMDb" }, { status: 404 });

    const existing = new MovieIndex(await listAllMovies({ fresh: true })).find({
      title: meta.title,
      year: meta.year,
      tmdbId: meta.tmdbId,
      imdbId: meta.imdbId,
    });
    if (existing) return NextResponse.json({ error: `"${existing.title}" is already in your library`, movie: existing }, { status: 409 });

    const movie = { ...emptyMovie(meta.title), ...meta };
    if (omdbProvider.configured()) Object.assign(movie, await omdbProvider.enrich!(movie).catch(() => null));
    movie.status = body.status ?? "Watchlist";
    movie.source = "Manual";
    movie.lastSynced = new Date().toISOString().slice(0, 10);
    const created = await createMovie(movie);
    revalidatePath("/");
    revalidatePath("/stats");
    return NextResponse.json({ movie: created }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
