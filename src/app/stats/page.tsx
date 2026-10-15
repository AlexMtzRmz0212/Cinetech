import { SetupError } from "@/components/SetupError";
import { listAllMovies } from "@/lib/notion/movies";
import { computeStats, type Count } from "@/lib/stats";

export const revalidate = 900;

function Bars({ title, data, unit }: { title: string; data: Count[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      {data.length === 0 && <p className="text-sm text-muted">No data yet</p>}
      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate">{d.label}{unit}</span>
            <span className="h-2 rounded bg-border">
              <span className="block h-2 rounded bg-accent" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="text-right text-muted">{d.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-border bg-panel p-4">
    <div className="text-2xl font-semibold">{value}</div>
    <div className="text-xs text-muted">{label}</div>
  </div>
);

export default async function Stats() {
  let s;
  try {
    s = computeStats(await listAllMovies());
  } catch (error) {
    return <SetupError error={error} />;
  }
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Stats</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Watched" value={s.watched} />
        <Tile label="Watchlist" value={s.watchlist} />
        <Tile label="Avg rating (of 5)" value={s.averageRating ?? "-"} />
        <Tile label="Hours watched" value={s.totalRuntimeHours} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Bars title="Watched per year" data={s.byYearWatched} />
        <Bars title="Your ratings" data={s.ratings} unit="★" />
        <Bars title="By decade" data={s.byDecade} />
        <Bars title="Top genres" data={s.genres} />
        <Bars title="Top directors" data={s.directors} />
        <Bars title="Top actors" data={s.actors} />
      </div>
    </>
  );
}
