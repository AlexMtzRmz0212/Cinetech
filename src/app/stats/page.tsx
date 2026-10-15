import { SetupError } from "@/components/SetupError";
import { count } from "@/lib/format";
import { listAllMovies } from "@/lib/notion/movies";
import { computeStats, type Count } from "@/lib/stats";

export const revalidate = 900;

/** At most this many x-axis labels; the rest stay in the hover value and the screen-reader text. */
const MAX_TICKS = 10;

const heading = "mb-5 font-display text-2xl leading-none font-bold uppercase";

/** Single-series column chart: thin tungsten columns on one baseline, the peak labelled, every value on hover. */
function Columns({ title, data, unit = "", empty }: { title: string; data: Count[]; unit?: string; empty: string }) {
  const max = Math.max(0, ...data.map((d) => d.count));
  const step = Math.ceil(data.length / MAX_TICKS);
  return (
    <section>
      <h2 className={heading}>{title}</h2>
      {max === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <>
          <ol className="flex h-52 items-end gap-0.5 border-b border-border pt-6">
            {data.map((d) => {
              const peak = d.count === max;
              return (
                <li key={d.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span
                    aria-hidden
                    className={`mb-1 text-xs tabular-nums ${peak ? "text-text" : "text-muted opacity-0 group-hover:opacity-100 motion-safe:transition-opacity"}`}
                  >
                    {d.count}
                  </span>
                  <span
                    aria-hidden
                    className="block w-full max-w-6 rounded-t-[4px] bg-accent group-hover:brightness-110"
                    style={{ height: `${(d.count / max) * 100}%` }}
                  />
                  <span className="sr-only">{`${d.label}${unit}: ${d.count}`}</span>
                </li>
              );
            })}
          </ol>
          <div aria-hidden className="mt-2 flex gap-0.5">
            {data.map((d, i) => (
              <span key={d.label} className="min-w-0 flex-1 text-center text-xs text-muted tabular-nums">
                {i % step === 0 || i === data.length - 1 ? `${d.label}${unit}` : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Top-N list: rank, name, a trackless bar for scale, the count. */
function Ranked({ title, data }: { title: string; data: Count[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section>
      <h2 className={heading}>{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted">No data yet</p>
      ) : (
        <ol className="space-y-2.5">
          {data.map((d, i) => (
            <li key={d.label} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 text-sm">
              <span className="text-right text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate" title={d.label}>{d.label}</span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-r-[4px] bg-accent/80" style={{ width: `${(d.count / max) * 100}%` }} />
              </span>
              <span className="text-muted tabular-nums">{d.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function Stats() {
  let s;
  try {
    s = computeStats(await listAllMovies());
  } catch (error) {
    return <SetupError error={error} />;
  }
  const figures: [string, string, string?][] = [
    ["Movies", count(s.total)],
    ["Watched", count(s.watched)],
    ["Watchlist", count(s.watchlist)],
    ["Average rating", s.averageRating != null ? `${s.averageRating}★` : "None yet", "text-accent"],
    ["Hours watched", count(s.totalRuntimeHours)],
  ];
  return (
    <>
      <h1 className="page-title">Stats</h1>

      <dl className="mb-14 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {figures.map(([label, value, tone]) => (
          <div key={label} className="flex flex-col-reverse border-t border-border pt-3">
            <dt className="mt-2 text-sm text-muted">{label}</dt>
            <dd className={`font-display text-6xl leading-none font-extrabold ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-14 grid gap-x-12 gap-y-12 lg:grid-cols-2">
        <Columns title="Your ratings" data={s.ratings} unit="★" empty="No ratings yet" />
        <Columns title="By decade" data={s.byDecade} empty="No release years yet" />
      </div>

      <div className="grid gap-x-12 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        <Ranked title="Top genres" data={s.genres} />
        <Ranked title="Top directors" data={s.directors} />
        <Ranked title="Top actors" data={s.actors} />
      </div>
    </>
  );
}
