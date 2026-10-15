"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { count, longDate, runtime } from "@/lib/format";
import { userRating, type Movie as FullMovie, type PublicMovie } from "@/lib/types";
import { EditMovie, TRACKERS } from "./EditMovie";

type SheetMovie = PublicMovie & Partial<Pick<FullMovie, "pageId" | "source" | "lastSynced">>;

interface Props {
  movie: SheetMovie;
  /** Owner mode: Notion's Status options. The sheet then shows the edit form. */
  statusOptions: string[] | null;
  onClose: () => void;
  onSaved: (movie: FullMovie) => void;
  onTrashed: (pageId: string) => void;
}

const CAST_SHOWN = 8;

/** Everything about one movie, lit by its own poster. Owners also get the edit form. */
export function FilmSheet({ movie, statusOptions, onClose, onSaved, onTrashed }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  // Whatever opened the sheet (a poster); focus goes back there when it closes.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const editable = Boolean(statusOptions && movie.pageId);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      // The dialog unmounts instead of closing, so the browser doesn't restore focus itself.
      opener?.focus({ preventScroll: true });
    };
  }, [opener]);

  const close = () => !busy && onClose();
  const rating = userRating(movie);
  const trackers = TRACKERS.filter(([key]) => movie[key] != null);
  const cast = movie.cast.slice(0, CAST_SHOWN).join(", ") + (movie.cast.length > CAST_SHOWN ? `, and ${count(movie.cast.length - CAST_SHOWN)} more` : "");
  const facts: [string, string | null | undefined][] = [
    ["Genres", movie.genres.join(", ")],
    ["Cast", cast],
    ["Languages", movie.languages.join(", ")],
    ["Released", longDate(movie.releaseDate)],
    ["IMDb", movie.imdbRating != null ? `${movie.imdbRating} / 10` : null],
    ["TMDb", movie.tmdbRating != null ? `${movie.tmdbRating} / 10` : null],
    ["Your trackers", trackers.map(([key, label]) => `${label} ${movie[key]}★`).join(", ")],
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      className="sheet fixed inset-0 h-dvh w-full items-end justify-center open:flex sm:items-center sm:p-6"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // The browser may still close it (e.g. Esc pressed twice); keep React in step.
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="relative isolate flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-panel shadow-[0_30px_80px_rgb(0_0_0/0.55)] sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-xl">
        {movie.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={movie.poster} alt="" aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-150 object-cover opacity-55 blur-[80px] saturate-150" />
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-panel/20 via-panel/70 to-panel/95" />

        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 cursor-pointer rounded-md p-2 text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <X size={20} aria-hidden />
        </button>

        <div className="overflow-y-auto overscroll-contain p-5 sm:p-8">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-5 gap-y-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-8">
            <div className="aspect-[2/3] self-start overflow-hidden rounded-md bg-bg sm:row-span-2">
              {movie.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={movie.poster} alt="" width={300} height={450} className="h-full w-full object-cover" />
              )}
            </div>

            <header className="min-w-0 self-end pr-8 sm:self-start">
              <h2 id="sheet-title" className="font-display text-4xl leading-[0.92] font-extrabold text-balance uppercase sm:text-5xl">
                {movie.title}
              </h2>
              <p className="mt-3 flex flex-wrap gap-x-4 text-sm text-muted tabular-nums">
                {movie.year && <span>{movie.year}</span>}
                {runtime(movie.runtime) && <span>{runtime(movie.runtime)}</span>}
              </p>
              {movie.directors.length > 0 && <p className="mt-1 text-sm">Directed by {movie.directors.join(", ")}</p>}
            </header>

            <div className="col-span-2 min-w-0 space-y-6 sm:col-span-1 sm:col-start-2">
              {(rating || movie.statusName) && (
                <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                  {rating && (
                    <p className="font-display text-5xl leading-none font-extrabold text-accent tabular-nums">
                      {rating}★<span className="sr-only"> your rating</span>
                    </p>
                  )}
                  {movie.statusName && <p className="text-sm">{movie.statusName}</p>}
                </div>
              )}

              {movie.overview && <p className="max-w-[62ch] text-base leading-relaxed">{movie.overview}</p>}

              <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                {facts
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>

              {editable && (
                <EditMovie
                  movie={movie as FullMovie}
                  statusOptions={statusOptions!}
                  onClose={onClose}
                  onSaved={onSaved}
                  onTrashed={onTrashed}
                  onBusyChange={setBusy}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
