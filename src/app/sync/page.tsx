import { SyncPanel } from "@/components/SyncPanel";
import { providers } from "@/lib/providers/registry";
import { tmdbUser } from "@/lib/tmdbUser";

export const dynamic = "force-dynamic";

const TMDB_RESULT: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "TMDb account connected.", ok: true },
  denied: { text: "TMDb connection was not approved.", ok: false },
  expired: { text: "TMDb connection timed out. Try again.", ok: false },
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
      <h1 className="page-title">Sync</h1>
      {tmdbResult && (
        <p
          role="status"
          className={`mb-6 rounded-md border px-4 py-2.5 text-sm ${tmdbResult.ok ? "border-ok/40 bg-ok/5 text-ok" : "border-danger/40 bg-danger/5 text-danger"}`}
        >
          {tmdbResult.text}
        </p>
      )}
      <SyncPanel
        providers={status}
        usernames={{ letterboxd: process.env.LETTERBOXD_USERNAME ?? "", trakt: process.env.TRAKT_USERNAME ?? "" }}
        tmdb={tmdb}
      />
    </>
  );
}
