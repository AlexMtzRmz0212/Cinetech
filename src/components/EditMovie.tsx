"use client";

import { Star, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { longDate } from "@/lib/format";
import type { Movie, RatingKey } from "@/lib/types";

const RATINGS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

export const TRACKERS: [RatingKey, string][] = [
  ["letterboxdRating", "Letterboxd"],
  ["imdbMyRating", "IMDb"],
  ["traktRating", "Trakt"],
  ["tmdbMyRating", "TMDb"],
];

/** Segmented buttons up to this many Status options; a select beyond. */
const MAX_SEGMENTS = 6;

/** Label wrapping a visually hidden radio: shows the checked and keyboard-focus states. */
const choice =
  "btn h-8 px-3 has-[:checked]:border-accent has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-50";

interface Props {
  movie: Movie;
  statusOptions: string[];
  onClose: () => void;
  onSaved: (movie: Movie) => void;
  onTrashed: (pageId: string) => void;
  /** Lets the sheet refuse to close while a request is running. */
  onBusyChange: (busy: boolean) => void;
}

/** Owner-only editor for the fields you own; everything else comes from the trackers and TMDb/OMDb. */
export function EditMovie({ movie, statusOptions, onClose, onSaved, onTrashed, onBusyChange }: Props) {
  const [statusName, setStatusName] = useState(movie.statusName ?? "");
  const [rating, setRating] = useState(movie.myRating ? String(movie.myRating) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Keep a status Notion has but the cached option list doesn't (e.g. renamed since).
  const options = [...new Set([...(statusOptions.length ? statusOptions : ["Watched", "Want to Watch"]), ...(movie.statusName ? [movie.statusName] : [])])];
  const fallback = TRACKERS.find(([key]) => movie[key] != null);

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
    if (Object.keys(patch).length === 0) return onClose();
    const data = await send("PATCH", patch);
    if (data) onSaved(data.movie);
  }

  async function trash() {
    if (!confirm(`Move "${movie.title}" to the Notion trash? You can restore it from Notion for 30 days.`)) return;
    if (await send("DELETE")) onTrashed(movie.pageId!);
  }

  const lit = hover ?? (rating ? Number(rating) : 0);
  const ratingText = rating ? `${rating}★` : fallback ? `None, shows ${fallback[1]} ${movie[fallback[0]]}★` : "None";
  const synced = [movie.source && `Source: ${movie.source}.`, movie.lastSynced && `Last synced ${longDate(movie.lastSynced, "short")}.`].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="edit-title" className="border-t border-border pt-6">
      <h3 id="edit-title" className="mb-4 font-display text-2xl leading-none font-bold uppercase">Edit in Notion</h3>

      <div className="space-y-5">
        <fieldset disabled={busy}>
          <legend className="label">Status</legend>
          {options.length <= MAX_SEGMENTS ? (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <label key={o} className={choice}>
                  <input type="radio" name="status" value={o} checked={statusName === o} onChange={() => setStatusName(o)} className="sr-only" />
                  {o}
                </label>
              ))}
            </div>
          ) : (
            <select aria-label="Status" className="input max-w-xs" value={statusName} onChange={(e) => setStatusName(e.target.value)}>
              {!statusName && <option value="">No status</option>}
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
        </fieldset>

        <fieldset disabled={busy}>
          <legend className="label">My rating</legend>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Ten half-star radios laid over five stars: arrow keys step by half a star. */}
            <div
              className="flex rounded-md text-muted/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              onMouseLeave={() => setHover(null)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className="relative block size-8">
                  <Star size={32} weight="fill" aria-hidden className="absolute inset-0" />
                  <span aria-hidden className="absolute inset-y-0 left-0 overflow-hidden text-accent" style={{ width: lit >= star ? "100%" : lit >= star - 0.5 ? "50%" : "0%" }}>
                    <Star size={32} weight="fill" />
                  </span>
                  {RATINGS.filter((r) => r === star || r === star - 0.5).map((r) => (
                    <label key={r} className={`absolute inset-y-0 w-1/2 cursor-pointer ${r === star ? "right-0" : "left-0"}`} onMouseEnter={() => setHover(r)}>
                      <input type="radio" name="rating" value={r} checked={rating === String(r)} onChange={() => setRating(String(r))} className="sr-only" />
                      <span className="sr-only">{`${r} stars`}</span>
                    </label>
                  ))}
                </span>
              ))}
            </div>
            <label className={choice}>
              <input type="radio" name="rating" value="" checked={rating === ""} onChange={() => setRating("")} className="sr-only" />
              None
            </label>
            <span className="text-sm text-muted tabular-nums" aria-live="polite">{ratingText}</span>
          </div>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>Save</button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-danger sm:ml-auto" onClick={trash} disabled={busy}>
          <Trash size={16} aria-hidden />
          Move to Notion trash
        </button>
      </div>

      {synced && <p className="mt-5 text-xs text-muted">{synced}</p>}
    </section>
  );
}
