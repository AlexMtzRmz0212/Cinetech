"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ImportEntry } from "@/lib/types";
import { Duplicates } from "./Duplicates";
import { LIBRARY_CHANGED } from "./OwnerNav";

interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
}

interface Progress {
  label: string;
  done: number;
  total: number | null; // null while unknown (library paging)
}

const BATCH = 8;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

type ImportSource = { files: File[] } | { username: string };

// When each sync last finished. Kept in this browser (the deployment has no server-side storage).
const LAST_KEY = "cinetech.lastSync";
type LastSync = Record<string, string>;

function readLast(): LastSync {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as LastSync;
  } catch {
    return {};
  }
}

function ago(iso: string | undefined): string {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const exact = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : "Not synced yet");

interface Stamp {
  /** Short name when a card has more than one way to sync, e.g. "Diary". */
  label?: string;
  at: string | undefined;
}

function Card({ title, last, className = "", children }: { title: string; last?: Stamp | Stamp[]; className?: string; children: ReactNode }) {
  const stamps = last === undefined ? [] : Array.isArray(last) ? last : [last];
  return (
    <section className={`flex flex-col rounded-lg border bg-panel p-4 ${className || "border-border"}`}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex flex-col items-end gap-1">
          {stamps.map((st) => (
            <span
              key={st.label ?? "main"}
              title={exact(st.at)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${st.at ? "border-green-400/40 bg-green-400/10 text-green-400" : "border-dashed border-red-400/40 bg-red-400/10 text-red-400"}`}
            >
              {st.label ? `${st.label}: ` : ""}
              {st.at ? `synced ${ago(st.at).toLowerCase()}` : "never synced"}
            </span>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}

interface Props {
  providers: ProviderStatus[];
  usernames: { letterboxd: string; trakt: string };
  tmdb: { connected: boolean; fromEnv: boolean };
}

export function SyncPanel({ providers, usernames, tmdb }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lbUser, setLbUser] = useState(usernames.letterboxd);
  const [traktUser, setTraktUser] = useState(usernames.trakt);
  const [tmdbConnected, setTmdbConnected] = useState(tmdb.connected);
  const [last, setLast] = useState<LastSync>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [run, setRun] = useState<{ label: string; at?: string } | null>(null);
  const logEl = useRef<HTMLPreElement>(null);
  const stop = useRef(false);
  const busy = progress !== null;

  useEffect(() => setLast(readLast()), []);

  const markSynced = (id: string) => {
    const next = { ...readLast(), [id]: new Date().toISOString() };
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(next));
    } catch {}
    setLast(next);
  };

  const add = (line: string) => setLog((l) => [...l.slice(-199), line]);

  useEffect(() => {
    if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [log]);

  const bump = (key: string) => setCounts((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  const startRun = (label: string) => {
    stop.current = false;
    setLog([]);
    setCounts({});
    setRun({ label });
  };
  const endRun = () => {
    setRun((r) => (r ? { ...r, at: new Date().toISOString() } : r));
    setProgress(null);
    window.dispatchEvent(new Event(LIBRARY_CHANGED));
  };

  async function enrich(provider: "tmdb" | "omdb", mode: "missing" | "full") {
    const label = `${mode === "full" ? "Refreshing all" : "Filling missing"} ${provider === "tmdb" ? "TMDb" : "OMDb"} data`;
    startRun(label);
    let cursor: string | null = null;
    let done = 0;
    try {
      do {
        setProgress({ label, done, total: null });
        const res: { results: { title: string; status: string; changed?: string[]; error?: string }[]; nextCursor: string | null } = await post("/api/sync", { cursor, mode, provider, batchSize: BATCH });
        for (const r of res.results) {
          done++;
          bump(r.status);
          if (r.status !== "skipped") add(`${r.status.padEnd(9)} ${r.title}${r.changed?.length ? `  (${r.changed.join(", ")})` : ""}${r.error ? `  ${r.error}` : ""}`);
        }
        cursor = res.nextCursor;
      } while (cursor && !stop.current);
      add(stop.current ? `Stopped after ${done} movies.` : `Done: ${done} movies checked.`);
      if (!stop.current) markSynced(`enrich-${provider}`);
    } catch (e) {
      add(`Error: ${e instanceof Error ? e.message : e}`);
    }
    endRun();
  }

  async function runImport(entries: ImportEntry[]) {
    const counts: Record<string, number> = {};
    // Rows this run created or updated, sent with every batch so none is created twice.
    const recent = new Map<string, { pageId?: string }>();
    let done = 0;
    for (let i = 0; i < entries.length && !stop.current; i += BATCH) {
      setProgress({ label: "Importing to Notion", done, total: entries.length });
      const batch = entries.slice(i, i + BATCH);
      const { results, touched } = await post<{ results: { title: string; action: string; detail?: string }[]; touched: { pageId?: string }[] }>(
        "/api/import/apply",
        { entries: batch, recent: [...recent.values()] },
      );
      for (const m of touched) if (m.pageId) recent.set(m.pageId, m);
      for (const r of results) {
        counts[r.action] = (counts[r.action] ?? 0) + 1;
        bump(r.action);
        done++;
        if (r.action !== "unchanged") add(`${r.action.padEnd(9)} ${r.title}${r.detail ? `  (${r.detail})` : ""}`);
      }
    }
    add(`Import finished: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing to do"}.`);
  }

  async function importFrom(providerId: string, label: string, source: ImportSource, syncKey = providerId, kind?: string) {
    startRun(`${label} import`);
    setProgress({ label: `Reading ${label} data`, done: 0, total: null });
    try {
      let res: Response;
      if ("files" in source) {
        const form = new FormData();
        source.files.forEach((f) => form.append("file", f));
        if (kind) form.append("kind", kind);
        res = await fetch(`/api/import/${providerId}`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/import/${providerId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      add(`Found ${data.entries.length} films in ${label} data.`);
      await runImport(data.entries);
      if (!stop.current) markSynced(syncKey);
    } catch (e) {
      add(`Error: ${e instanceof Error ? e.message : e}`);
    }
    endRun();
  }

  /** `kind` tells the server what the file is (IMDb: ratings or watchlist), so the button you pick decides how it is read. */
  const upload = (providerId: string, label: string, accept: string, text: string, multiple = false, syncKey = providerId, kind?: string) => (
    <label className="btn cursor-pointer">
      {text}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) importFrom(providerId, label, { files }, syncKey, kind);
        }}
      />
    </label>
  );

  async function disconnectTmdb() {
    await fetch("/api/tmdb/disconnect", { method: "POST" });
    setTmdbConnected(false);
  }

  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : null;

  const omdbReady = Boolean(providers.find((p) => p.id === "omdb")?.configured);
  // [last-sync key, label, provider id whose configuration gates it]
  const jobs: [string, string, string][] = [
    ["enrich-tmdb", "TMDb metadata", "tmdb"],
    ["enrich-omdb", "OMDb ratings", "omdb"],
    ["letterboxd-diary", "Letterboxd diary", "letterboxd"],
    ["letterboxd-zip", "Letterboxd ZIP", "letterboxd"],
    ["imdb-ratings", "IMDb ratings", "imdb"],
    ["imdb-watchlist", "IMDb watchlist", "imdb"],
    ["trakt", "Trakt", "trakt"],
    ["tmdb-account", "TMDb account", "tmdb-account"],
  ];
  const chipTone = (k: string) =>
    ["updated", "created", "merged"].includes(k) ? "text-green-400" : ["failed", "error"].includes(k) ? "text-red-400" : "text-muted";
  const chips = Object.entries(counts);

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[30rem] lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)]">
      {/* Controls */}
      <div className="space-y-4 lg:order-2 lg:col-span-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Metadata</h2>

        <Card title="TMDb" last={{ at: last["enrich-tmdb"] }}>
          <p className="mb-3 text-sm text-muted">
            Year, directors, genres, cast, runtime, overview, poster and IMDb id. Fill missing only touches movies lacking a poster,
            overview, directors, genres or cast.
          </p>
          <div className="mt-auto">
            <button className="btn btn-primary" disabled={busy} onClick={() => enrich("tmdb", "missing")}>Fill missing data</button>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted">Overwrites existing data</span>
              <button
                className="btn border-red-400/40 text-xs text-red-300 hover:border-red-400"
                disabled={busy}
                onClick={() => confirm("Overwrite existing TMDb data with fresh values?") && enrich("tmdb", "full")}
              >
                Refresh everything
              </button>
            </div>
          </div>
        </Card>

        <Card title="OMDb" last={{ at: last["enrich-omdb"] }}>
          <p className="mb-3 text-sm text-muted">
            IMDb rating. Needs the movie&apos;s IMDb id, so run TMDb first for new movies.
            {!omdbReady && " Needs OMDB_API_KEY in your environment."}
          </p>
          <div className="mt-auto">
            <button className="btn btn-primary" disabled={busy || !omdbReady} onClick={() => enrich("omdb", "missing")}>Fill missing data</button>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted">Overwrites existing data</span>
              <button
                className="btn border-red-400/40 text-xs text-red-300 hover:border-red-400"
                disabled={busy || !omdbReady}
                onClick={() => confirm("Overwrite existing OMDb data with fresh values?") && enrich("omdb", "full")}
              >
                Refresh everything
              </button>
            </div>
          </div>
        </Card>

        <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Import</h2>

        <Card title="Letterboxd" last={[{ label: "Diary", at: last["letterboxd-diary"] }, { label: "ZIP", at: last["letterboxd-zip"] }]}>
          <p className="mb-3 text-sm text-muted">
            Quick sync reads your public diary feed (recent entries). For your full history and watchlist, upload the ZIP from
            Letterboxd &rarr; Settings &rarr; Data &rarr; Export.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <input className="input max-w-48" placeholder="Letterboxd username" value={lbUser} onChange={(e) => setLbUser(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => importFrom("letterboxd", "Letterboxd", { username: lbUser }, "letterboxd-diary")}>Sync recent diary</button>
            {upload("letterboxd", "Letterboxd", ".zip", "Upload export ZIP", false, "letterboxd-zip")}
          </div>
        </Card>

        <Card title="IMDb" last={[{ label: "Ratings", at: last["imdb-ratings"] }, { label: "Watchlist", at: last["imdb-watchlist"] }]}>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm font-medium">Ratings</div>
              <p className="mb-2 text-sm text-muted">
                Your Ratings page &rarr; &#8942; &rarr; Export. Imported as Watched, rating 1-10 becomes 0.5-5. The watched date is the date you rated it.
              </p>
              {upload("imdb", "IMDb ratings", ".csv", "Upload ratings.csv", false, "imdb-ratings", "ratings")}
            </div>
            <div className="border-t border-border pt-3">
              <div className="mb-1 text-sm font-medium">Watchlist</div>
              <p className="mb-2 text-sm text-muted">
                Your Watchlist &rarr; &#8942; &rarr; Export. Adds new movies as Watchlist. Movies already in your library are left alone.
              </p>
              {upload("imdb", "IMDb watchlist", ".csv", "Upload watchlist CSV", false, "imdb-watchlist", "watchlist")}
            </div>
          </div>
        </Card>

        <Card title="Trakt" last={{ at: last.trakt }}>
          <p className="mb-3 text-sm text-muted">
            Imports watched movies, ratings and watchlist from a public Trakt profile.
            {!providers.find((p) => p.id === "trakt")?.configured && " Needs TRAKT_CLIENT_ID in your environment."}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <input className="input max-w-48" placeholder="Trakt username" value={traktUser} onChange={(e) => setTraktUser(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => importFrom("trakt", "Trakt", { username: traktUser })}>Import from Trakt</button>
          </div>
        </Card>

        <Card title="TMDb account" last={{ at: last["tmdb-account"] }}>
          <p className="mb-3 text-sm text-muted">
            Imports the movies you rated on TMDb (as Watched) and your TMDb watchlist. Connecting sends you to TMDb once to approve read access.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            {tmdbConnected ? (
              <>
                <button className="btn" disabled={busy} onClick={() => importFrom("tmdb-account", "TMDb", { username: "" })}>Import from TMDb</button>
                {!tmdb.fromEnv && <button className="btn" disabled={busy} onClick={disconnectTmdb}>Disconnect</button>}
              </>
            ) : (
              <a className={`btn ${busy ? "pointer-events-none opacity-50" : ""}`} href="/api/tmdb/connect">Connect TMDb account</a>
            )}
          </div>
        </Card>

        <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Library</h2>
        <Duplicates disabled={busy} />
      </div>

      {/* Display */}
      <aside className="lg:order-1 lg:col-span-3 lg:min-h-0">
        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel lg:h-full">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${busy ? "animate-pulse bg-accent" : "bg-border"}`} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{progress ? `${progress.label}…` : run ? run.label : "Idle"}</div>
                <div className="text-xs text-muted">
                  {busy ? "Running" : run?.at ? `Finished ${ago(run.at).toLowerCase()}` : "Nothing running"}
                </div>
              </div>
            </div>
            {busy && <button className="btn shrink-0" onClick={() => (stop.current = true)}>Stop</button>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {progress && (
              <div className="shrink-0">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted">Progress</span>
                  <span>{progress.done}{progress.total ? ` / ${progress.total}` : ""}</span>
                </div>
                <div className="h-2 rounded bg-border">
                  <div className={`h-2 rounded bg-accent transition-all ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
                </div>
              </div>
            )}

            {chips.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {chips.map(([k, n]) => (
                  <span key={k} className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs">
                    <span className={`text-base font-semibold ${chipTone(k)}`}>{n}</span> <span className="text-muted">{k}</span>
                  </span>
                ))}
              </div>
            )}

            <pre ref={logEl} className="h-72 min-h-48 overflow-auto whitespace-pre-wrap break-words lg:h-auto lg:flex-1 rounded-md border border-border bg-bg p-3 font-mono text-xs leading-5">
              {log.length ? log.join("\n") : <span className="text-muted">Pick an action on the left. Progress and results appear here live.</span>}
            </pre>

            <div className="shrink-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Last synced</h3>
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map(([id, name, providerId]) => {
                  const ok = providers.find((p) => p.id === providerId)?.configured ?? false;
                  return (
                    <li key={id} className="flex items-center gap-2" title={`${exact(last[id])}${ok ? "" : " (not configured)"}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-green-400" : "bg-muted/50"}`} />
                      <span className="truncate">{name}</span>
                      <span className={`ml-auto shrink-0 text-xs ${last[id] ? "text-green-400" : "text-red-400"}`}>{ago(last[id])}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
