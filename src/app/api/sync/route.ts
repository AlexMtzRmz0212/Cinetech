import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { mapLimit } from "@/lib/http";
import { listMoviesPage, updateMovie } from "@/lib/notion/movies";
import { enrichMovie, isComplete, type EnrichMode } from "@/lib/sync/enrich";

export const maxDuration = 60;

interface Body {
  cursor?: string | null;
  mode?: EnrichMode;
  batchSize?: number;
}

/**
 * Enrich one page of the library. The browser loops, passing back `nextCursor`,
 * so no single request runs long enough to hit serverless time limits.
 */
export async function POST(request: Request) {
  try {
    const { cursor = null, mode = "missing", batchSize = 8 } = (await request.json().catch(() => ({}))) as Body;
    const page = await listMoviesPage(cursor, Math.min(Math.max(batchSize, 1), 25));

    const results = await mapLimit(page.movies, 3, async (movie) => {
      if (mode === "missing" && isComplete(movie)) return { title: movie.title, status: "skipped" as const };
      try {
        const { found, patch, changed } = await enrichMovie(movie, mode);
        if (!found) return { title: movie.title, status: "not-found" as const };
        if (movie.pageId) await updateMovie(movie.pageId, patch);
        return { title: movie.title, status: changed.length ? ("updated" as const) : ("unchanged" as const), changed };
      } catch (error) {
        return { title: movie.title, status: "failed" as const, error: error instanceof Error ? error.message : String(error) };
      }
    });

    revalidatePath("/");
    revalidatePath("/stats");
    return NextResponse.json({ results, nextCursor: page.nextCursor });
  } catch (error) {
    return fail(error);
  }
}
