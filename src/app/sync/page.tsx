import { SyncPanel } from "@/components/SyncPanel";
import { providers } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default function SyncPage() {
  const status = providers.map((p) => ({ id: p.id, label: p.label, configured: p.configured() }));
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Sync</h1>
      <SyncPanel providers={status} usernames={{ letterboxd: process.env.LETTERBOXD_USERNAME ?? "", trakt: process.env.TRAKT_USERNAME ?? "" }} />
    </>
  );
}
