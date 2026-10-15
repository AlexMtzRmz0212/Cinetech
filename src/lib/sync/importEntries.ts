import { createMovie, listAllMovies, updateMovie } from "../notion/movies";
import { resolveTmdbIdStrict, tmdbProvider } from "../providers/tmdb";
import type { ImportEntry, Movie, RatingKey } from "../types";
import { emptyMovie } from "../types";
import { enrichMovie } from "./enrich";
import { MovieIndex } from "./match";

export type ImportAction = "created" | "updated" | "unchanged" | "failed";

export interface ImportOutcome {
  title: string;
  action: ImportAction;
  detail?: string;
}

/** The fields of a row that matching and `patchForEntry` need, so batches can pass them along cheaply. */
export type SlimMovie = Pick<
  Movie,
  "pageId" | "title" | "year" | "tmdbId" | "imdbId" | "status" | "watchedDate" | "source" | RatingKey
>;

export const slim = (m: Movie): SlimMovie => ({
  pageId: m.pageId,
  title: m.title,
  year: m.year ?? null,
  tmdbId: m.tmdbId ?? null,
  imdbId: m.imdbId ?? null,
  status: m.status ?? null,
  watchedDate: m.watchedDate ?? null,
  source: m.source ?? null,
  myRating: m.myRating ?? null,
  letterboxdRating: m.letterboxdRating ?? null,
  imdbMyRating: m.imdbMyRating ?? null,
  traktRating: m.traktRating ?? null,
  tmdbMyRating: m.tmdbMyRating ?? null,
});

const latest = (a?: string | null, b?: string | null) => (a && b ? (a > b ? a : b) : (a ?? b ?? null));

/** Each tracker has its own rating column; unknown sources go straight to the master rating. */
const RATING_COLUMN: Record<string, RatingKey> = {
  Letterboxd: "letterboxdRating",
  IMDb: "imdbMyRating",
  Trakt: "traktRating",
  TMDb: "tmdbMyRating",
};
export const ratingField = (source: string): RatingKey => RATING_COLUMN[source] ?? "myRating";

/**
 * What an import entry changes on an existing movie. The tracker's own rating column always follows
 * the tracker; the master rating (My Rating) is only filled when empty, so your own choice wins.
 */
export function patchForEntry(movie: Partial<Movie>, entry: ImportEntry): Partial<Movie> {
  const patch: Partial<Movie> = {};
  if (entry.status === "Watched") {
    if (movie.status !== "Watched") patch.status = "Watched";
    const date = latest(movie.watchedDate, entry.watchedDate);
    if (date && date !== movie.watchedDate) patch.watchedDate = date;
    if (entry.rating) {
      const field = ratingField(entry.source);
      if (entry.rating !== movie[field]) patch[field] = entry.rating;
      if (movie.myRating == null) patch.myRating = entry.rating;
    }
  }
  // Watchlist entries never change an existing row: its Notion status is more informed.
  if (!movie.source && Object.keys(patch).length) patch.source = entry.source;
  return patch;
}

/** A TMDb id for a film that is not in the library yet, or null when no match is certain. */
async function confidentTmdbId(entry: ImportEntry): Promise<number | null> {
  if (entry.tmdbId) return entry.tmdbId;
  if (!tmdbProvider.configured()) return null;
  return resolveTmdbIdStrict(entry).catch(() => null);
}

export interface ImportResult {
  outcomes: ImportOutcome[];
  /** Rows created or updated by this batch; the browser sends them with the next batch. */
  touched: SlimMovie[];
}

/**
 * Write a batch of entries to Notion. `recent` are rows this import run already touched: a
 * later batch may run on another server instance, or before Notion lists the new pages, so
 * they are added to the index explicitly instead of trusting the library listing.
 */
export async function importEntries(entries: ImportEntry[], recent: SlimMovie[] = []): Promise<ImportResult> {
  const index = new MovieIndex(await listAllMovies());
  for (const m of recent) index.add({ ...emptyMovie(m.title), ...m });
  const outcomes: ImportOutcome[] = [];
  const touched = new Map<string, SlimMovie>();

  const update = async (movie: Movie, entry: ImportEntry, extra: Partial<Movie> = {}) => {
    // Attach ids we just learned to a row that lacked them.
    const ids = Object.fromEntries(Object.entries(extra).filter(([k]) => movie[k as keyof Movie] == null));
    const patch = { ...ids, ...patchForEntry(movie, entry) };
    if (Object.keys(patch).length === 0) {
      outcomes.push({ title: entry.title, action: "unchanged" });
      return;
    }
    await updateMovie(movie.pageId!, patch);
    Object.assign(movie, patch);
    index.add(movie);
    touched.set(movie.pageId!, slim(movie));
    outcomes.push({ title: entry.title, action: "updated", detail: Object.keys(patch).join(", ") });
  };

  // Sequential on purpose: two entries for the same film must not both create a page.
  for (const entry of entries) {
    try {
      const existing = index.find(entry);
      if (existing?.pageId) {
        await update(existing, entry);
        continue;
      }

      const tmdbId = await confidentTmdbId(entry);
      const base: Movie = {
        ...emptyMovie(entry.title),
        year: entry.year ?? null,
        tmdbId,
        imdbId: entry.imdbId ?? null,
      };
      // Only enrich on a certain match; a guess could pull in another film's data.
      const enriched = tmdbId ? await enrichMovie(base, "missing").catch(() => null) : null;
      const imdbId = enriched?.patch.imdbId ?? entry.imdbId ?? null;

      // The ids may reveal that this film already exists under another title/year.
      const duplicate = tmdbId || imdbId ? index.find({ title: "", tmdbId, imdbId }) : undefined;
      if (duplicate?.pageId) {
        await update(duplicate, entry, { tmdbId, imdbId });
        continue;
      }

      const movie: Movie = {
        ...base,
        ...enriched?.patch,
        title: entry.title,
        status: entry.status,
        source: entry.source,
        watchedDate: entry.status === "Watched" ? (entry.watchedDate ?? null) : null,
      };
      if (entry.status === "Watched" && entry.rating) {
        movie[ratingField(entry.source)] = entry.rating;
        movie.myRating = entry.rating;
      }
      const created = await createMovie(movie);
      index.add(created);
      touched.set(created.pageId!, slim(created));
      outcomes.push({
        title: entry.title,
        action: "created",
        detail: tmdbId ? (enriched?.found ? undefined : "no TMDb data") : "no confident TMDb match, check it",
      });
    } catch (error) {
      outcomes.push({ title: entry.title, action: "failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { outcomes, touched: [...touched.values()] };
}
