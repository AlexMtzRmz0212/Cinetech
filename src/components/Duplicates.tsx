"use client";

import { useState } from "react";
import { LIBRARY_CHANGED } from "./OwnerNav";

interface Row {
  pageId: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  status: string | null;
  rating: number | null;
  watchedDate: string | null;
  source: string | null;
}

interface Group {
  keep: Row;
  trash: Row[];
  fills: string[];
}

const describe = (r: Row) =>
  [r.year, r.status, r.rating ? `${r.rating}★` : null, r.source, r.tmdbId ? `TMDb ${r.tmdbId}` : null, r.imdbId]
    .filter(Boolean)
    .join(", ");

/** Finds rows that are the same film and merges them on request, one group at a time. */
export function Duplicates({ disabled }: { disabled: boolean }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function load() {
    setBusy("load");
    setError("");
    try {
      const res = await fetch("/api/duplicates", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(data.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  const idsOf = (g: Group) => [g.keep.pageId, ...g.trash.map((r) => r.pageId)];

  /** Merge groups in chunks (one library read per request). Groups that merge leave the list; failures are reported. */
  async function mergeGroups(list: Group[]) {
    const CHUNK = 10;
    let failed = 0;
    setError("");
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        setProgress({ done: i, total: list.length });
        const res = await fetch("/api/duplicates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ groups: chunk.map(idsOf) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const results = data.results as { id: string; ok: boolean; error?: string }[];
        const merged = new Set(results.filter((r) => r.ok).map((r) => r.id));
        failed += results.length - merged.size;
        const firstError = results.find((r) => !r.ok)?.error;
        if (firstError) setError(firstError);
        setGroups((gs) => gs?.filter((g) => !merged.has(g.keep.pageId)) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress(null);
    setBusy(null);
    if (failed) setError((prev) => `${failed} group${failed > 1 ? "s" : ""} could not be merged. ${prev}`.trim());
    window.dispatchEvent(new Event(LIBRARY_CHANGED));
  }

  function merge(group: Group) {
    const n = group.trash.length;
    if (!confirm(`Combine everything into "${group.keep.title}" and move ${n} duplicate row${n > 1 ? "s" : ""} to the Notion trash?`)) return;
    setBusy(group.keep.pageId);
    return mergeGroups([group]);
  }

  function mergeAll() {
    if (!groups?.length) return;
    if (!confirm(`Merge all ${groups.length} duplicate groups? Each keeps its most complete row, gets every field from the other rows, and the others move to the Notion trash (you can restore them there).`)) return;
    setBusy("all");
    return mergeGroups(groups);
  }

  return (
    <section className="p-4 sm:p-5">
      <h3 className="mb-2 font-semibold">Duplicates</h3>
      <p className="mb-3 max-w-[60ch] text-sm text-muted">
        Rows with the same TMDb id, IMDb id, or title and year. Merging keeps the most complete row and combines everything from the
        others into it: any field only one row has, lists (genres, cast, tags) joined, notes appended, and Watched wins. The rest go to
        the Notion trash, where they can be restored. Text written inside a page is not copied.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={disabled || busy !== null} onClick={load}>
          {busy === "load" ? "Looking…" : groups ? "Look again" : "Find duplicates"}
        </button>
        {groups && groups.length > 1 && (
          <button className="btn btn-primary" disabled={disabled || busy !== null} onClick={mergeAll}>
            {busy === "all" && progress ? `Merging ${progress.done} / ${progress.total}…` : `Merge all ${groups.length} groups`}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {groups && groups.length === 0 && <p className="mt-3 text-sm text-muted">No duplicates found.</p>}
      {groups && groups.length > 0 && (
        <ul className="mt-4 space-y-3">
          {groups.map((g) => {
            const fills = g.fills.filter((f) => f !== "watchedDate");
            return (
              <li key={g.keep.pageId} className="rounded-md border border-border bg-well p-3 text-sm">
                <p>
                  <span className="font-medium text-ok">Keep</span> {g.keep.title} <span className="text-muted">{describe(g.keep)}</span>
                </p>
                {g.trash.map((r) => (
                  <p key={r.pageId} className="mt-1 text-muted">
                    <span className="font-medium text-danger">Trash</span> {r.title}, {describe(r)}
                  </p>
                ))}
                {fills.length > 0 && <p className="mt-2 text-xs text-muted">Fills in: {fills.join(", ")}</p>}
                <button className="btn mt-3 h-8" disabled={disabled || busy !== null} onClick={() => merge(g)}>
                  {busy === g.keep.pageId ? "Merging…" : "Merge"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
