import type { Movie } from "../types";
import { getSchema, notion, refreshSchema, type NotionAny } from "./client";
import { movieToProperties, pageToMovie } from "./mapper";

export interface MoviePage {
  movies: Movie[];
  nextCursor: string | null;
}

export async function listMoviesPage(cursor?: string | null, pageSize = 100): Promise<MoviePage> {
  const { dataSourceId, titleProp } = await getSchema();
  const res: NotionAny = await notion().dataSources.query({
    data_source_id: dataSourceId,
    page_size: pageSize,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
  const movies = (res.results as NotionAny[])
    .filter((p) => p.object === "page")
    .map((p) => pageToMovie(p, titleProp))
    .filter((m) => m.title);
  return { movies, nextCursor: res.has_more ? (res.next_cursor as string) : null };
}

/** Whole library, cached briefly so bursts of requests (import batches) share one fetch. */
let cache: { at: number; movies: Promise<Movie[]> } | undefined;
const TTL_MS = 15_000;

export function listAllMovies({ fresh = false } = {}): Promise<Movie[]> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.movies;
  const movies = (async () => {
    const all: Movie[] = [];
    let cursor: string | null = null;
    do {
      const page: MoviePage = await listMoviesPage(cursor);
      all.push(...page.movies);
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  })();
  cache = { at: Date.now(), movies };
  movies.catch(() => {
    if (cache?.movies === movies) cache = undefined;
  });
  return movies;
}

export const invalidateLibrary = () => {
  cache = undefined;
};

/** The poster doubles as the Notion page icon and cover. */
const posterArt = (poster?: string | null) =>
  poster ? { icon: { type: "external" as const, external: { url: poster } }, cover: { type: "external" as const, external: { url: poster } } } : {};

/**
 * The schema is cached per process, so a column type changed in Notion (e.g. Cast converted to text) makes writes fail with
 * "X is expected to be <type>" (or a schema-size error from sending a multi-select by mistake). Reload the schema once and retry with the right type.
 */
async function withFreshSchema<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!(error instanceof Error) || !/is expected to be|exceeded the maximum size|is not a property that exists/.test(error.message)) throw error;
    await refreshSchema();
    return write();
  }
}

export async function createMovie(movie: Movie): Promise<Movie> {
  const page: NotionAny = await withFreshSchema(async () => {
    const { dataSourceId, titleProp, props } = await getSchema();
    return notion().pages.create({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties: movieToProperties(movie, titleProp, props),
      ...posterArt(movie.poster),
    });
  });
  invalidateLibrary();
  return { ...movie, pageId: page.id };
}

/** `extra` is a raw Notion `properties` payload for columns the Movie model doesn't cover (used when merging duplicates). */
export async function updateMovie(pageId: string, patch: Partial<Movie>, extra: Record<string, NotionAny> = {}): Promise<void> {
  await withFreshSchema(async () => {
    const { titleProp, props } = await getSchema();
    const properties = { ...extra, ...movieToProperties(patch, titleProp, props) };
    if (Object.keys(properties).length === 0) return;
    await notion().pages.update({ page_id: pageId, properties, ...posterArt(patch.poster) });
  });
  invalidateLibrary();
}

/** Moves the page to Notion's trash, where it can still be restored (it is not a permanent delete). */
export async function trashMovie(pageId: string): Promise<void> {
  await notion().pages.update({ page_id: pageId, in_trash: true });
  invalidateLibrary();
}
