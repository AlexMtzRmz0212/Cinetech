import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { mapLimit } from "@/lib/http";
import { listAllMovies } from "@/lib/notion/movies";
import { findDuplicates, planMerge } from "@/lib/sync/dedupe";
import { mergeGroup } from "@/lib/sync/mergeDuplicates";
import { userRating, type Movie } from "@/lib/types";

export const maxDuration = 60;

const summary = (m: Movie) => ({
  pageId: m.pageId,
  title: m.title,
  year: m.year ?? null,
  tmdbId: m.tmdbId ?? null,
  imdbId: m.imdbId ?? null,
  status: m.statusName ?? m.status ?? null,
  rating: userRating(m),
  watchedDate: m.watchedDate ?? null,
  source: m.source ?? null,
});

/** Groups of rows that look like the same film, with the row that would be kept first. */
export async function GET() {
  try {
    const groups = findDuplicates(await listAllMovies({ fresh: true })).map((group) => {
      const { keep, trash, patch } = planMerge(group);
      return { keep: summary(keep), trash: trash.map(summary), fills: Object.keys(patch) };
    });
    return NextResponse.json({ groups });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Merge groups of duplicates (each group is a list of page ids). One fresh listing is shared by the whole request,
 * so merging many groups doesn't re-read the library for every one. Every row's data is combined into the kept row.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { groups?: string[][]; pageIds?: string[] };
    const requested = body.groups ?? (body.pageIds ? [body.pageIds] : []);
    if (!requested.length || requested.some((g) => !Array.isArray(g) || g.length < 2)) {
      return NextResponse.json({ error: "Send the page ids of each group" }, { status: 400 });
    }

    // Re-plan from the current library so a stale or tampered request can't merge unrelated rows.
    const current = findDuplicates(await listAllMovies({ fresh: true }));
    const results = await mapLimit(requested, 2, async (pageIds) => {
      const wanted = new Set(pageIds);
      const group = current.find((g) => g.length === wanted.size && g.every((m) => m.pageId && wanted.has(m.pageId)));
      if (!group) return { id: pageIds[0], ok: false, error: "These rows are no longer a duplicate group. Reload the list." };
      try {
        const merged = await mergeGroup(group);
        return { id: pageIds[0], ok: true, kept: merged.kept, trashed: merged.trashed };
      } catch (error) {
        return { id: pageIds[0], ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    revalidatePath("/");
    revalidatePath("/stats");
    return NextResponse.json({ results });
  } catch (error) {
    return fail(error);
  }
}
