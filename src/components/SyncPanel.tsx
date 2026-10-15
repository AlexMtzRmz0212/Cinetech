"use client";

import { Stop, UploadSimple } from "@phosphor-icons/react";
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

/** One sync source: its name, when it last synced (per way of syncing), and its controls. */
function Source({ title, last, children }: { title: string; last?: Stamp | Stamp[]; children: ReactNode }) {
  const stamps = last === undefined ? [] : Array.isArray(last) ? last : [last];
  return (
    <section className="p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="flex flex-col items-end text-xs">
          {stamps.map((st) => (
            <span key={st.label ?? "main"} title={exact(st.at)} className={st.at ? "text-ok" : "text-danger"}>
              {st.label ? `${st.label}: ` : ""}
              {st.at ? `synced ${ago(st.at).toLowerCase()}` : "never synced"}
            </span>
          ))}
        </p>
      </div>
      {children}
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl leading-none font-bold uppercase">{title}</h2>
      <div className="divide-y divide-border rounded-md border border-border bg-panel">{children}</div>
    </section>
  );
}

const describe = "mb-3 max-w-[60ch] text-sm text-muted";

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
    // The input is visually hidden but still focusable, so the upload works from the keyboard.
    <label className="btn has-[:disabled]:cursor-default has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <UploadSimple size={16} aria-hidden />
      {text}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
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
    ["updated", "created", "merged"].includes(k) ? "text-ok" : ["failed", "error"].includes(k) ? "text-danger" : "text-text";
  const chips = Object.entries(counts);

  return (
    // Fills the viewport below the header and page title on large screens; each column scrolls on its own.
    <div className="grid gap-6 lg:h-[calc(100dvh-12.25rem)] lg:min-h-[30rem] lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)]">
      {/* Controls */}
      <div className="space-y-8 lg:order-2 lg:col-span-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <Group title="Metadata">
          <Source title="TMDb" last={{ at: last["enrich-tmdb"] }}>
            <p className={describe}>
              Year, directors, genres, cast, runtime, overview, poster and IMDb id. Fill missing only touches movies lacking a poster,
              overview, directors, genres or cast.
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={() => enrich("tmdb", "missing")}>Fill missing data</button>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                className="btn btn-danger h-8 text-xs"
                disabled={busy}
                onClick={() => confirm("Overwrite existing TMDb data with fresh values?") && enrich("tmdb", "full")}
              >
                Refresh everything
              </button>
              <span className="text-xs text-muted">Overwrites existing data</span>
            </div>
          </Source>

          <Source title="OMDb" last={{ at: last["enrich-omdb"] }}>
            <p className={describe}>
              IMDb rating. Needs the movie&apos;s IMDb id, so run TMDb first for new movies.
              {!omdbReady && " Needs OMDB_API_KEY in your environment."}
            </p>
            <button className="btn btn-primary" disabled={busy || !omdbReady} onClick={() => enrich("omdb", "missing")}>Fill missing data</button>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                className="btn btn-danger h-8 text-xs"
                disabled={busy || !omdbReady}
                onClick={() => confirm("Overwrite existing OMDb data with fresh values?") && enrich("omdb", "full")}
              >
                Refresh everything
              </button>
              <span className="text-xs text-muted">Overwrites existing data</span>
            </div>
          </Source>
        </Group>

        <Group title="Import">
          <Source title="Letterboxd" last={[{ label: "Diary", at: last["letterboxd-diary"] }, { label: "ZIP", at: last["letterboxd-zip"] }]}>
            <p className={describe}>
              Quick sync reads your public diary feed (recent entries). For your full history and watchlist, upload the ZIP from
              Letterboxd &rarr; Settings &rarr; Data &rarr; Export.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className="input max-w-48"
                aria-label="Letterboxd username"
                placeholder="Letterboxd username…"
                autoComplete="off"
                spellCheck={false}
                value={lbUser}
                onChange={(e) => setLbUser(e.target.value)}
              />
              <button className="btn" disabled={busy} onClick={() => importFrom("letterboxd", "Letterboxd", { username: lbUser }, "letterboxd-diary")}>Sync recent diary</button>
              {upload("letterboxd", "Letterboxd", ".zip", "Upload export ZIP", false, "letterboxd-zip")}
            </div>
          </Source>

          <Source title="IMDb" last={[{ label: "Ratings", at: last["imdb-ratings"] }, { label: "Watchlist", at: last["imdb-watchlist"] }]}>
            <div className="space-y-4">
              <div>
                <h4 className="mb-1 text-sm font-medium">Ratings</h4>
                <p className={describe}>
                  Your Ratings page &rarr; &#8942; &rarr; Export. Imported as Watched, rating 1-10 becomes 0.5-5.
                </p>
                {upload("imdb", "IMDb ratings", ".csv", "Upload ratings.csv", false, "imdb-ratings", "ratings")}
              </div>
              <div>
                <h4 className="mb-1 text-sm font-medium">Watchlist</h4>
                <p className={describe}>
                  Your Watchlist &rarr; &#8942; &rarr; Export. Adds new movies as Watchlist. Movies already in your library are left alone.
                </p>
                {upload("imdb", "IMDb watchlist", ".csv", "Upload watchlist CSV", false, "imdb-watchlist", "watchlist")}
              </div>
            </div>
          </Source>

          <Source title="Trakt" last={{ at: last.trakt }}>
            <p className={describe}>
              Imports watched movies, ratings and watchlist from a public Trakt profile.
              {!providers.find((p) => p.id === "trakt")?.configured && " Needs TRAKT_CLIENT_ID in your environment."}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className="input max-w-48"
                aria-label="Trakt username"
                placeholder="Trakt username…"
                autoComplete="off"
                spellCheck={false}
                value={traktUser}
                onChange={(e) => setTraktUser(e.target.value)}
              />
              <button className="btn" disabled={busy} onClick={() => importFrom("trakt", "Trakt", { username: traktUser })}>Import from Trakt</button>
            </div>
          </Source>

          <Source title="TMDb account" last={{ at: last["tmdb-account"] }}>
            <p className={describe}>
              Imports the movies you rated on TMDb (as Watched) and your TMDb watchlist. Connecting sends you to TMDb once to approve read access.
            </p>
            <div className="flex flex-wrap gap-2">
              {tmdbConnected ? (
                <>
                  <button className="btn" disabled={busy} onClick={() => importFrom("tmdb-account", "TMDb", { username: "" })}>Import from TMDb</button>
                  {!tmdb.fromEnv && <button className="btn" disabled={busy} onClick={disconnectTmdb}>Disconnect</button>}
                </>
              ) : (
                <a className={`btn ${busy ? "pointer-events-none opacity-50" : ""}`} aria-disabled={busy || undefined} href="/api/tmdb/connect">Connect TMDb account</a>
              )}
            </div>
          </Source>
        </Group>

        <Group title="Library">
          <Duplicates disabled={busy} />
        </Group>
      </div>

      {/* Display */}
      <aside className="lg:order-1 lg:col-span-3 lg:min-h-0">
        <section aria-label="Sync activity" className="flex flex-col overflow-hidden rounded-md border border-border bg-panel lg:h-full">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${busy ? "bg-accent motion-safe:animate-pulse" : "bg-border"}`} />
              <div className="min-w-0" role="status">
                <div className="truncate font-display text-2xl leading-tight font-bold uppercase">{progress ? `${progress.label}…` : run ? run.label : "Idle"}</div>
                <div className="text-xs text-muted">
                  {busy ? "Running" : run?.at ? `Finished ${ago(run.at).toLowerCase()}` : "Nothing running"}
                </div>
              </div>
            </div>
            {busy && (
              <button className="btn shrink-0" onClick={() => (stop.current = true)}>
                <Stop size={14} weight="fill" aria-hidden />
                Stop
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-5">
            {progress && (
              <div className="shrink-0">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted">Progress</span>
                  <span className="tabular-nums">{progress.done}{progress.total ? ` / ${progress.total}` : ""}</span>
                </div>
                <div
                  className="h-1 overflow-hidden bg-border"
                  role="progressbar"
                  aria-label="Progress"
                  aria-valuemin={0}
                  aria-valuemax={progress.total ?? undefined}
                  aria-valuenow={pct === null ? undefined : progress.done}
                >
                  {pct === null ? (
                    <div className="progress-indeterminate h-full w-1/3 bg-accent" />
                  ) : (
                    <div className="h-full origin-left bg-accent motion-safe:transition-transform" style={{ transform: `scaleX(${pct / 100})` }} />
                  )}
                </div>
              </div>
            )}

            {chips.length > 0 && (
              <dl className="flex shrink-0 flex-wrap gap-x-7 gap-y-3">
                {chips.map(([k, n]) => (
                  <div key={k} className="flex flex-col-reverse">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className={`font-display text-3xl leading-none font-bold tabular-nums ${chipTone(k)}`}>{n}</dd>
                  </div>
                ))}
              </dl>
            )}

            <pre
              ref={logEl}
              tabIndex={0}
              aria-label="Sync log"
              className="h-72 min-h-48 overflow-auto rounded-md border border-border bg-well p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap lg:h-auto lg:flex-1"
            >
              {log.length ? log.join("\n") : <span className="text-muted">Pick an action. Progress and results appear here live.</span>}
            </pre>

            <div className="shrink-0">
              <h3 className="mb-2 text-sm font-semibold">Last synced</h3>
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map(([id, name, providerId]) => {
                  const ok = providers.find((p) => p.id === providerId)?.configured ?? false;
                  return (
                    <li key={id} className="flex items-baseline gap-2" title={`${exact(last[id])}${ok ? "" : " (not configured)"}`}>
                      <span className={`truncate ${ok ? "" : "text-muted"}`}>
                        {name}
                        {!ok && " (not set up)"}
                      </span>
                      <span className={`ml-auto shrink-0 text-xs ${last[id] ? "text-ok" : "text-danger"}`}>{ago(last[id])}</span>
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
