"use client";

import { useEffect, useState } from "react";
import type { Movie } from "@/lib/types";

const RATINGS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

const TRACKERS: [keyof Movie, string][] = [
  ["letterboxdRating", "Letterboxd"],
  ["imdbMyRating", "IMDb"],
  ["traktRating", "Trakt"],
  ["tmdbMyRating", "TMDb"],
];

interface Props {
  movie: Movie;
  statusOptions: string[];
  onClose: () => void;
  onSaved: (movie: Movie) => void;
  onTrashed: (pageId: string) => void;
}

/** Owner-only editor for the fields you own; everything else comes from the trackers and TMDb/OMDb. */
export function EditMovie({ movie, statusOptions, onClose, onSaved, onTrashed }: Props) {
  const [statusName, setStatusName] = useState(movie.statusName ?? "");
  const [rating, setRating] = useState(movie.myRating ? String(movie.myRating) : "");
  const [watchedDate, setWatchedDate] = useState(movie.watchedDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Keep a status Notion has but the cached option list doesn't (e.g. renamed since).
  const options = [...new Set([...(statusOptions.length ? statusOptions : ["Watched", "Want to Watch"]), ...(movie.statusName ? [movie.statusName] : [])])];
  const trackers = TRACKERS.filter(([key]) => movie[key] != null);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/movies/${movie.pageId}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const patch: Record<string, unknown> = {};
    if (statusName && statusName !== (movie.statusName ?? "")) patch.statusName = statusName;
    const newRating = rating ? Number(rating) : null;
    if (newRating !== (movie.myRating ?? null)) patch.myRating = newRating;
    const newDate = watchedDate || null;
    if (newDate !== (movie.watchedDate ?? null)) patch.watchedDate = newDate;
    if (Object.keys(patch).length === 0) return onClose();
    const data = await send("PATCH", patch);
    if (data) onSaved(data.movie);
  }

  async function trash() {
    if (!confirm(`Move "${movie.title}" to the Notion trash? You can restore it from Notion for 30 days.`)) return;
    if (await send("DELETE")) onTrashed(movie.pageId!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="max-h-[90vh] w-full overflow-auto rounded-t-xl border border-border bg-panel p-4 sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex gap-3">
          {movie.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={movie.poster} alt="" className="h-24 w-16 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0">
            <h2 id="edit-title" className="font-semibold">{movie.title}</h2>
            <p className="text-sm text-muted">{[movie.year, movie.directors[0]].filter(Boolean).join(" · ")}</p>
            {trackers.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {trackers.map(([key, label]) => `${label} ${movie[key]}★`).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <select className="input" value={statusName} onChange={(e) => setStatusName(e.target.value)} disabled={busy}>
              {!statusName && <option value="">—</option>}
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">My rating</span>
            <select className="input" value={rating} onChange={(e) => setRating(e.target.value)} disabled={busy}>
              <option value="">{trackers.length ? "None (show tracker rating)" : "None"}</option>
              {RATINGS.map((r) => (
                <option key={r} value={r}>{`${r}★`}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Watched date</span>
            <input className="input" type="date" value={watchedDate} onChange={(e) => setWatchedDate(e.target.value)} disabled={busy} />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn ml-auto text-red-400" onClick={trash} disabled={busy}>Move to Notion trash</button>
        </div>
      </div>
    </div>
  );
}
