import { fetchRetry } from "../http";
import { optional, required } from "../env";
import { tmdbUser } from "../tmdbUser";
import type { ImportEntry } from "../types";
import type { MovieProvider } from "./types";

const SOURCE = "TMDb";
const API = "https://api.themoviedb.org/4";

interface AccountMovie {
  id: number;
  title: string;
  release_date?: string;
  account_rating?: { value: number; created_at?: string };
}

/** Calls TMDb's v4 auth endpoints with the app's read access token. */
export async function tmdbAuth<T>(method: "POST" | "DELETE", path: string, body: unknown): Promise<T> {
  const res = await fetchRetry(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${required("TMDB_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { status_message?: string };
  if (!res.ok) throw new Error(`TMDb ${path} failed: ${data.status_message ?? res.status}`);
  return data;
}

async function list(path: string, accessToken: string): Promise<AccountMovie[]> {
  const out: AccountMovie[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await fetchRetry(`${API}${path}?page=${page}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
    if (res.status === 401) throw new Error("TMDb access was revoked: connect your TMDb account again");
    if (!res.ok) throw new Error(`TMDb ${path} failed: ${res.status}`);
    const data = (await res.json()) as { results?: AccountMovie[]; total_pages?: number };
    out.push(...(data.results ?? []));
    pages = data.total_pages ?? 1;
  }
  return out;
}

const year = (date?: string) => (date ? Number(date.slice(0, 4)) || null : null);

/** Rated movies count as watched (TMDb rates 0.5-10, rounded to the 0.5-5 scale); the rest of the watchlist stays Watchlist. */
export function combineTmdb(rated: AccountMovie[], watchlist: AccountMovie[]): ImportEntry[] {
  const byId = new Map<number, ImportEntry>();
  for (const m of watchlist) byId.set(m.id, { title: m.title, year: year(m.release_date), tmdbId: m.id, status: "Watchlist", source: SOURCE });
  for (const m of rated) {
    const value = m.account_rating?.value;
    byId.set(m.id, {
      title: m.title,
      year: year(m.release_date),
      tmdbId: m.id,
      status: "Watched",
      rating: value ? Math.max(0.5, Math.round(value) / 2) : null,
      watchedDate: m.account_rating?.created_at?.slice(0, 10) ?? null, // TMDb only records when you rated it
      source: SOURCE,
    });
  }
  return [...byId.values()];
}

export const tmdbAccountProvider: MovieProvider = {
  id: "tmdb-account",
  label: "TMDb account",
  configured: () => Boolean(optional("TMDB_TOKEN")),
  async import() {
    const user = await tmdbUser();
    if (!user) throw new Error("Connect your TMDb account first");
    const base = `/account/${encodeURIComponent(user.accountId)}/movie`;
    const [rated, watchlist] = await Promise.all([list(`${base}/rated`, user.accessToken), list(`${base}/watchlist`, user.accessToken)]);
    return combineTmdb(rated, watchlist);
  },
};
