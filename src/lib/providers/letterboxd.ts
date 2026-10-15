import JSZip from "jszip";
import Papa from "papaparse";
import { fetchRetry } from "../http";
import { optional } from "../env";
import { normTitle } from "../sync/match";
import type { ImportEntry } from "../types";
import type { ImportInput, MovieProvider } from "./types";

const SOURCE = "Letterboxd";

const toNumber = (v: string | undefined | null) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

const latest = (a?: string | null, b?: string | null) => (a && b ? (a > b ? a : b) : (a ?? b ?? null));

// ---------------------------------------------------------------- RSS

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return undefined;
  return m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
};

/** Parse a public Letterboxd RSS feed (diary entries only; list items have no filmTitle). */
export function parseRss(xml: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(item, "letterboxd:filmTitle");
    if (!title) continue;
    entries.push({
      title,
      year: toNumber(tag(item, "letterboxd:filmYear")),
      tmdbId: toNumber(tag(item, "tmdb:movieId")),
      status: "Watched",
      rating: toNumber(tag(item, "letterboxd:memberRating")),
      watchedDate: tag(item, "letterboxd:watchedDate") ?? null,
      source: SOURCE,
    });
  }
  return entries;
}

export async function fetchRss(username: string): Promise<ImportEntry[]> {
  const res = await fetchRetry(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`, {
    headers: { "user-agent": "cinetech/0.1 (personal sync)" },
  });
  if (res.status === 404) throw new Error(`Letterboxd user "${username}" not found (profile must be public)`);
  if (!res.ok) throw new Error(`Letterboxd RSS failed: ${res.status}`);
  return parseRss(await res.text());
}

// ---------------------------------------------------------------- Export ZIP

type Row = Record<string, string>;
const csv = (text: string): Row[] =>
  Papa.parse<Row>(text, { header: true, skipEmptyLines: true }).data;

/** Combine the files of a Letterboxd data export into one entry per film. */
export function entriesFromCsvs(files: Partial<Record<"diary" | "ratings" | "watched" | "watchlist", string>>): ImportEntry[] {
  const byKey = new Map<string, ImportEntry>();
  const get = (row: Row, status: ImportEntry["status"]) => {
    const year = toNumber(row.Year);
    // Not the "Letterboxd URI": in diary.csv it points to the diary entry, not the film.
    const key = `${normTitle(row.Name ?? "")}|${year}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { title: row.Name, year, status, source: SOURCE };
      byKey.set(key, entry);
    }
    return entry;
  };

  if (files.watchlist) for (const row of csv(files.watchlist)) get(row, "Watchlist");
  // Anything watched/rated/logged overrides a stale watchlist entry.
  for (const row of files.watched ? csv(files.watched) : []) get(row, "Watched").status = "Watched";
  for (const row of files.ratings ? csv(files.ratings) : []) {
    const entry = get(row, "Watched");
    entry.status = "Watched";
    entry.rating = toNumber(row.Rating);
  }
  for (const row of files.diary ? csv(files.diary) : []) {
    const entry = get(row, "Watched");
    entry.status = "Watched";
    entry.watchedDate = latest(entry.watchedDate, row["Watched Date"] || null);
    entry.rating ??= toNumber(row.Rating);
  }
  return [...byKey.values()].filter((e) => e.title);
}

export async function parseExport(data: ArrayBuffer): Promise<ImportEntry[]> {
  const zip = await JSZip.loadAsync(data);
  const read = async (name: string) => {
    const file = zip.file(new RegExp(`(^|/)${name}\\.csv$`))[0];
    return file ? file.async("string") : undefined;
  };
  const files = {
    diary: await read("diary"),
    ratings: await read("ratings"),
    watched: await read("watched"),
    watchlist: await read("watchlist"),
  };
  if (!Object.values(files).some(Boolean)) {
    throw new Error("No diary.csv / ratings.csv / watched.csv / watchlist.csv found. Is this a Letterboxd export?");
  }
  return entriesFromCsvs(files);
}

export const letterboxdProvider: MovieProvider = {
  id: "letterboxd",
  label: "Letterboxd",
  configured: () => true, // ZIP upload needs no credentials; RSS needs LETTERBOXD_USERNAME
  async import(input: ImportInput) {
    if (input.kind === "file") return parseExport(input.data);
    const username = input.username || optional("LETTERBOXD_USERNAME");
    if (!username) throw new Error("Set LETTERBOXD_USERNAME or enter a username");
    return fetchRss(username);
  },
};
