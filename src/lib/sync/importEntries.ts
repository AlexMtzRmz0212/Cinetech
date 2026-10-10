import { createMovie, listAllMovies, updateMovie } from "../notion/movies";
import type { ImportEntry, Movie } from "../types";
import { emptyMovie } from "../types";
import { enrichMovie } from "./enrich";
import { MovieIndex } from "./match";

export type ImportAction = "created" | "updated" | "unchanged" | "failed";

export interface ImportOutcome {
  title: string;
  action: ImportAction;
  detail?: string;
}

const latest = (a?: string | null, b?: string | null) => (a && b ? (a > b ? a : b) : (a ?? b ?? null));

const ratingField = (entry: ImportEntry) => (entry.source === "Letterboxd" ? "letterboxdRating" : "myRating") as "letterboxdRating" | "myRating";

/** What an import entry changes on an existing movie. User data in Notion wins when it is already set. */
export function patchForEntry(movie: Movie, entry: ImportEntry): Partial<Movie> {
  const patch: Partial<Movie> = {};
  if (entry.status === "Watched") {
    if (movie.status !== "Watched") patch.status = "Watched";
    const date = latest(movie.watchedDate, entry.watchedDate);
    if (date && date !== movie.watchedDate) patch.watchedDate = date;
    if (entry.rating) {
      const field = ratingField(entry);
      if (entry.rating !== movie[field]) patch[field] = entry.rating;
    }
  }
  // Watchlist entries never change an existing row: its Notion status is more informed.
  if (!movie.source && Object.keys(patch).length) patch.source = entry.source;
  return patch;
}

export async function importEntries(entries: ImportEntry[]): Promise<ImportOutcome[]> {
  const index = new MovieIndex(await listAllMovies());
  const outcomes: ImportOutcome[] = [];

  // Sequential on purpose: two entries for the same film must not both create a page.
  for (const entry of entries) {
    try {
      const existing = index.find(entry);
      if (existing?.pageId) {
        const patch = patchForEntry(existing, entry);
        if (Object.keys(patch).length === 0) {
          outcomes.push({ title: entry.title, action: "unchanged" });
          continue;
        }
        await updateMovie(existing.pageId, patch);
        Object.assign(existing, patch);
        outcomes.push({ title: entry.title, action: "updated", detail: Object.keys(patch).join(", ") });
        continue;
      }

      const base: Movie = {
        ...emptyMovie(entry.title),
        year: entry.year ?? null,
        tmdbId: entry.tmdbId ?? null,
        imdbId: entry.imdbId ?? null,
      };
      const enriched = await enrichMovie(base, "missing").catch(() => null);
      const movie: Movie = {
        ...base,
        ...enriched?.patch,
        title: entry.title,
        status: entry.status,
        source: entry.source,
        watchedDate: entry.status === "Watched" ? (entry.watchedDate ?? null) : null,
        [ratingField(entry)]: entry.rating ?? null,
      };
      // The enriched id may reveal that this film already exists under another title/year.
      const duplicate = movie.tmdbId ? index.find({ title: "", tmdbId: movie.tmdbId }) : undefined;
      if (duplicate?.pageId) {
        const patch = patchForEntry(duplicate, entry);
        if (Object.keys(patch).length) await updateMovie(duplicate.pageId, patch);
        Object.assign(duplicate, patch);
        outcomes.push({ title: entry.title, action: Object.keys(patch).length ? "updated" : "unchanged" });
        continue;
      }
      const created = await createMovie(movie);
      index.add(created);
      outcomes.push({ title: entry.title, action: "created", detail: enriched?.found ? undefined : "no TMDb match" });
    } catch (error) {
      outcomes.push({ title: entry.title, action: "failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
