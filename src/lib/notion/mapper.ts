import type { Movie, Status } from "../types";
import { emptyMovie } from "../types";
import { FIELDS, MAX_MULTI_SELECT, optionName, type FieldKey } from "./schema";
import type { NotionAny } from "./client";

const plain = (items: NotionAny[] | undefined) =>
  (items ?? []).map((t) => t.plain_text ?? "").join("");

/** A list column: multi-select options, or comma-separated text (Cast). */
const names = (prop: NotionAny): string[] =>
  prop?.rich_text
    ? plain(prop.rich_text).split(",").map((n: string) => n.trim()).filter(Boolean)
    : (prop?.multi_select ?? []).map((o: NotionAny) => o.name as string);

const text = (prop: NotionAny): string | null => plain(prop?.rich_text) || null;
const num = (prop: NotionAny): number | null => (typeof prop?.number === "number" ? prop.number : null);
const date = (prop: NotionAny): string | null => prop?.date?.start?.slice(0, 10) ?? null;

/** Notion page -> Movie. Tolerates missing columns and legacy data (e.g. "N/A"). */
export function pageToMovie(page: NotionAny, titleProp: string): Movie {
  const p = page.properties ?? {};
  const movie = emptyMovie(plain(p[titleProp]?.title));
  movie.pageId = page.id;
  movie.year = num(p[FIELDS.year.name]);
  movie.imdbId = text(p[FIELDS.imdbId.name]);
  movie.imdbRating = num(p[FIELDS.imdbRating.name]);
  movie.tmdbRating = num(p[FIELDS.tmdbRating.name]);
  movie.letterboxdRating = num(p[FIELDS.letterboxdRating.name]);
  movie.myRating = num(p[FIELDS.myRating.name]);
  movie.imdbMyRating = num(p[FIELDS.imdbMyRating.name]);
  movie.traktRating = num(p[FIELDS.traktRating.name]);
  movie.tmdbMyRating = num(p[FIELDS.tmdbMyRating.name]);
  movie.tmdbId = num(p[FIELDS.tmdbId.name]);
  movie.directors = names(p[FIELDS.directors.name]);
  movie.genres = names(p[FIELDS.genres.name]);
  movie.languages = names(p[FIELDS.languages.name]);
  movie.cast = names(p[FIELDS.cast.name]);
  movie.releaseDate = date(p[FIELDS.releaseDate.name]);
  movie.runtime = num(p[FIELDS.runtime.name]);
  movie.overview = text(p[FIELDS.overview.name]);
  movie.poster = p[FIELDS.poster.name]?.url ?? null;
  movie.statusName = p[FIELDS.status.name]?.status?.name ?? p[FIELDS.status.name]?.select?.name ?? null;
  movie.status = statusFromNotion(movie.statusName);
  movie.watchedDate = date(p[FIELDS.watchedDate.name]);
  movie.source = p[FIELDS.source.name]?.select?.name ?? null;
  movie.lastSynced = date(p[FIELDS.lastSynced.name]);
  return movie;
}

/** Your Notion status options <-> the app's Watched/Watchlist. Anything else maps to null and is left alone. */
const WATCHED = ["Watched", "I recommend", "Would Have to Rewatch"];
const WATCHLIST = ["Want to Watch", "Was recommended"];
const NOTION_OPTION: Record<Status, string> = { Watched: "Watched", Watchlist: "Want to Watch" };

export function statusFromNotion(name?: string | null): Status | null {
  if (!name) return null;
  if (WATCHED.includes(name)) return "Watched";
  if (WATCHLIST.includes(name)) return "Watchlist";
  return null;
}

const richText = (value: string) => [{ text: { content: value.slice(0, 2000) } }];

function encode(key: FieldKey, value: unknown, actual?: string): NotionAny {
  let { type }: { type: string } = FIELDS[key];
  // Status, Cast and Director(s) follow the column's real type (the last two may still be multi-selects until converted to text in Notion).
  if ((key === "status" || key === "cast" || key === "directors") && actual) type = actual;
  switch (type) {
    case "number":
      return { number: typeof value === "number" && Number.isFinite(value) ? value : null };
    case "rich_text":
      if (Array.isArray(value)) {
        const unique = [...new Set((value as string[]).map(optionName).filter(Boolean))].slice(0, MAX_MULTI_SELECT);
        return { rich_text: unique.length ? richText(unique.join(", ")) : [] };
      }
      return { rich_text: value ? richText(String(value)) : [] };
    case "url":
      return { url: value ? String(value) : null };
    case "date":
      return { date: value ? { start: String(value) } : null };
    case "status":
      return value ? { status: { name: NOTION_OPTION[value as Status] ?? String(value) } } : {};
    case "select":
      return { select: value ? { name: optionName(String(value)) } : null };
    case "multi_select": {
      const list = (Array.isArray(value) ? value : []) as string[];
      const unique = [...new Set(list.map(optionName).filter(Boolean))].slice(0, MAX_MULTI_SELECT);
      return { multi_select: unique.map((name) => ({ name })) };
    }
  }
}

/** Partial Movie -> Notion `properties` payload. Only keys present in `patch` are written. */
export function movieToProperties(
  patch: Partial<Movie>,
  titleProp: string,
  types: Record<string, string> = {},
): Record<string, NotionAny> {
  const out: Record<string, NotionAny> = {};
  if (patch.title !== undefined) out[titleProp] = { title: richText(patch.title) };
  for (const key of Object.keys(FIELDS) as FieldKey[]) {
    if (key in patch) out[FIELDS[key].name] = encode(key, patch[key], types[FIELDS[key].name]);
  }
  // A raw option name (edited in the app) wins over the Watched/Watchlist category.
  if (patch.statusName) out[FIELDS.status.name] = encode("status", patch.statusName, types[FIELDS.status.name]);
  return out;
}
