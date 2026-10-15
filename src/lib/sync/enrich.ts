import { enrichers } from "../providers/registry";
import type { Movie, MovieMetadata } from "../types";

export type EnrichMode = "missing" | "full";

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A movie with these filled in is considered done by the "missing" mode. */
export const isComplete = (m: Movie) =>
  !isEmpty(m.tmdbId) && !isEmpty(m.poster) && !isEmpty(m.overview) && !isEmpty(m.directors) && !isEmpty(m.genres) && !isEmpty(m.cast);

export interface EnrichResult {
  found: boolean;
  patch: Partial<Movie>;
  changed: string[];
}

/**
 * Query every configured enrichment provider and merge what they know into `patch`.
 *  - "missing": only fills empty fields, never touches what is already in Notion.
 *  - "full": provider data overwrites existing values.
 * `only` limits the run to one provider id (e.g. "tmdb" or "omdb").
 * User-owned fields (status, watched date, Letterboxd rating, source) are never in provider output.
 */
export async function enrichMovie(movie: Movie, mode: EnrichMode, only?: string): Promise<EnrichResult> {
  let working: Movie = { ...movie };
  const gathered: MovieMetadata = {};

  for (const provider of enrichers().filter((p) => !only || p.id === only)) {
    const meta = await provider.enrich!(working);
    if (!meta) continue;
    for (const [key, value] of Object.entries(meta)) {
      if (isEmpty(value)) continue;
      // First provider to supply a field wins within one run (TMDb before OMDb).
      if (!(key in gathered)) (gathered as Record<string, unknown>)[key] = value;
    }
    working = { ...working, ...gathered };
  }

  const found = Object.keys(gathered).length > 0;
  const patch: Partial<Movie> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(gathered)) {
    if (key === "title") continue; // never rename the user's entry
    const current = (movie as unknown as Record<string, unknown>)[key];
    const apply = mode === "full" ? !same(current, value) : isEmpty(current);
    if (apply) {
      (patch as Record<string, unknown>)[key] = value;
      changed.push(key);
    }
  }
  if (found) patch.lastSynced = new Date().toISOString().slice(0, 10);
  return { found, patch, changed };
}
