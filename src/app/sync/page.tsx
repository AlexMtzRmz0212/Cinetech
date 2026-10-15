import { SyncPanel } from "@/components/SyncPanel";
import { providers } from "@/lib/providers/registry";
import { tmdbUser } from "@/lib/tmdbUser";

export const dynamic = "force-dynamic";

const TMDB_RESULT: Record<string, string> = {
  connected: "TMDb account connected.",
  denied: "TMDb connection was not approved.",
  expired: "TMDb connection timed out. Try again.",
};

export default async function SyncPage({ searchParams }: { searchParams: Promise<{ tmdb?: string }> }) {
  const tmdbResult = TMDB_RESULT[(await searchParams).tmdb ?? ""];
  const tmdb = {
    connected: Boolean(await tmdbUser().catch(() => null)),
    fromEnv: Boolean(process.env.TMDB_USER_TOKEN && process.env.TMDB_ACCOUNT_ID),
  };
  const status = providers.map((p) => ({ id: p.id, label: p.label, configured: p.configured() }));
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Sync</h1>
      {tmdbResult && <p className="mb-4 rounded-md border border-border bg-panel px-3 py-2 text-sm">{tmdbResult}</p>}
      <SyncPanel
        providers={status}
        usernames={{ letterboxd: process.env.LETTERBOXD_USERNAME ?? "", trakt: process.env.TRAKT_USERNAME ?? "" }}
        tmdb={tmdb}
      />
    </>
  );
}
