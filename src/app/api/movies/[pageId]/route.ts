import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getSchema } from "@/lib/notion/client";
import { statusFromNotion } from "@/lib/notion/mapper";
import { listAllMovies, trashMovie, updateMovie } from "@/lib/notion/movies";
import type { Movie } from "@/lib/types";

type Params = { params: Promise<{ pageId: string }> };

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Only pages of the movie database can be edited, never any other page the integration sees. */
async function findMovie(pageId: string): Promise<Movie | undefined> {
  const id = pageId.replace(/-/g, "");
  return (await listAllMovies()).find((m) => m.pageId?.replace(/-/g, "") === id);
}

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/stats");
};

interface Body {
  statusName?: string | null;
  myRating?: number | null;
  watchedDate?: string | null;
}

/** Edit the fields you own: Status (any Notion option), master rating, watched date. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { pageId } = await params;
    const body = (await request.json().catch(() => ({}))) as Body;
    const movie = await findMovie(pageId);
    if (!movie?.pageId) return NextResponse.json({ error: "Movie not found" }, { status: 404 });

    const patch: Partial<Movie> = {};
    if (body.statusName !== undefined) {
      const { statusOptions } = await getSchema();
      if (!body.statusName || (statusOptions.length && !statusOptions.includes(body.statusName))) return bad("Unknown status");
      patch.statusName = body.statusName;
    }
    if (body.myRating !== undefined) {
      const r = body.myRating;
      if (r !== null && !(typeof r === "number" && r >= 0.5 && r <= 5 && Number.isInteger(r * 2))) return bad("Rating must be 0.5-5 in half steps");
      patch.myRating = r;
    }
    if (body.watchedDate !== undefined) {
      const d = body.watchedDate;
      if (d !== null && !(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))) return bad("Watched date must be YYYY-MM-DD");
      patch.watchedDate = d;
    }
    if (Object.keys(patch).length === 0) return bad("Nothing to change");

    await updateMovie(movie.pageId, patch);
    const updated: Movie = { ...movie, ...patch };
    if (patch.statusName) updated.status = statusFromNotion(patch.statusName);
    refresh();
    return NextResponse.json({ movie: updated });
  } catch (error) {
    return fail(error);
  }
}

/** Moves the movie to Notion's trash (restorable from Notion for 30 days). */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const movie = await findMovie((await params).pageId);
    if (!movie?.pageId) return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    await trashMovie(movie.pageId);
    refresh();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
