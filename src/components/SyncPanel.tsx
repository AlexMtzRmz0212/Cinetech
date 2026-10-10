"use client";

import { useRef, useState } from "react";
import type { ImportEntry } from "@/lib/types";

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

export function SyncPanel({ providers, usernames }: { providers: ProviderStatus[]; usernames: { letterboxd: string; trakt: string } }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lbUser, setLbUser] = useState(usernames.letterboxd);
  const [traktUser, setTraktUser] = useState(usernames.trakt);
  const stop = useRef(false);
  const busy = progress !== null;

  const add = (line: string) => setLog((l) => [...l.slice(-199), line]);

  async function enrich(mode: "missing" | "full") {
    stop.current = false;
    setLog([]);
    let cursor: string | null = null;
    let done = 0;
    try {
      do {
        setProgress({ label: mode === "full" ? "Refreshing all metadata" : "Filling missing metadata", done, total: null });
        const res: { results: { title: string; status: string; changed?: string[]; error?: string }[]; nextCursor: string | null } = await post("/api/sync", { cursor, mode, batchSize: BATCH });
        for (const r of res.results) {
          done++;
          if (r.status !== "skipped") add(`${r.status.padEnd(9)} ${r.title}${r.changed?.length ? `  (${r.changed.join(", ")})` : ""}${r.error ? `  ${r.error}` : ""}`);
        }
        cursor = res.nextCursor;
      } while (cursor && !stop.current);
      add(stop.current ? `Stopped after ${done} movies.` : `Done: ${done} movies checked.`);
    } catch (e) {
      add(`Error: ${e instanceof Error ? e.message : e}`);
    }
    setProgress(null);
  }

  async function runImport(entries: ImportEntry[]) {
    const counts: Record<string, number> = {};
    let done = 0;
    for (let i = 0; i < entries.length && !stop.current; i += BATCH) {
      setProgress({ label: "Importing to Notion", done, total: entries.length });
      const batch = entries.slice(i, i + BATCH);
      const { results } = await post<{ results: { title: string; action: string; detail?: string }[] }>("/api/import/apply", { entries: batch });
      for (const r of results) {
        counts[r.action] = (counts[r.action] ?? 0) + 1;
        done++;
        if (r.action !== "unchanged") add(`${r.action.padEnd(9)} ${r.title}${r.detail ? `  (${r.detail})` : ""}`);
      }
    }
    add(`Import finished: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing to do"}.`);
  }

  async function importFrom(providerId: string, label: string, source: ImportSource) {
    stop.current = false;
    setLog([]);
    setProgress({ label: `Reading ${label} data`, done: 0, total: null });
    try {
      let res: Response;
      if ("files" in source) {
        const form = new FormData();
        source.files.forEach((f) => form.append("file", f));
        res = await fetch(`/api/import/${providerId}`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/import/${providerId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      add(`Found ${data.entries.length} films in ${label} data.`);
      await runImport(data.entries);
    } catch (e) {
      add(`Error: ${e instanceof Error ? e.message : e}`);
    }
    setProgress(null);
  }

  const upload = (providerId: string, label: string, accept: string, text: string, multiple = false) => (
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
          if (files.length) importFrom(providerId, label, { files });
        }}
      />
    </label>
  );

  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-1 font-semibold">Enrich from TMDb / OMDb</h2>
        <p className="mb-3 text-sm text-muted">
          Fills year, directors, genres, languages, cast, release date, runtime, overview, poster and ratings for each movie in Notion.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => enrich("missing")}>Fill missing data</button>
          <button className="btn" disabled={busy} onClick={() => confirm("Overwrite existing metadata with fresh provider data?") && enrich("full")}>Refresh everything</button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-1 font-semibold">Letterboxd</h2>
        <p className="mb-3 text-sm text-muted">
          Quick sync reads your public diary feed (recent entries). For your full history and watchlist, upload the ZIP from
          Letterboxd &rarr; Settings &rarr; Data &rarr; Export.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="input max-w-56" placeholder="Letterboxd username" value={lbUser} onChange={(e) => setLbUser(e.target.value)} />
          <button className="btn" disabled={busy} onClick={() => importFrom("letterboxd", "Letterboxd", { username: lbUser })}>Sync recent diary</button>
        </div>
        {upload("letterboxd", "Letterboxd", ".zip", "Upload export ZIP")}
      </section>

      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-1 font-semibold">IMDb</h2>
        <p className="mb-3 text-sm text-muted">
          Export your ratings and watchlist from IMDb (your ratings page or list &rarr; Export) and upload the CSV files. Ratings become
          Watched with a 0.5-5 rating; watchlist entries stay on the watchlist.
        </p>
        {upload("imdb", "IMDb", ".csv", "Upload CSV file(s)", true)}
      </section>

      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-1 font-semibold">Trakt</h2>
        <p className="mb-3 text-sm text-muted">
          Imports watched movies, ratings and watchlist from a public Trakt profile.
          {!providers.find((p) => p.id === "trakt")?.configured && " Needs TRAKT_CLIENT_ID in your environment."}
        </p>
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-56" placeholder="Trakt username" value={traktUser} onChange={(e) => setTraktUser(e.target.value)} />
          <button className="btn" disabled={busy} onClick={() => importFrom("trakt", "Trakt", { username: traktUser })}>Import from Trakt</button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-2 font-semibold">Sources</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {providers.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.label}</span>
              <span className={p.configured ? "text-green-400" : "text-muted"}>{p.configured ? "ready" : "not configured"}</span>
            </li>
          ))}
        </ul>
      </section>

      {progress && (
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>{progress.label}…</span>
            <span className="text-muted">{progress.done}{progress.total ? ` / ${progress.total}` : ""}</span>
          </div>
          <div className="h-2 rounded bg-border">
            <div className={`h-2 rounded bg-accent ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
          </div>
          <button className="btn mt-2" onClick={() => (stop.current = true)}>Stop</button>
        </div>
      )}

      {log.length > 0 && (
        <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-panel p-3 text-xs leading-5">{log.join("\n")}</pre>
      )}
    </div>
  );
}
