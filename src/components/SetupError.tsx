export function SetupError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm">
      <p className="mb-2 font-semibold text-red-300">Couldn&apos;t load your Notion library</p>
      <p className="mb-3 font-mono text-red-200">{message}</p>
      <p className="text-muted">
        Check <code>.env.local</code> (see <code>.env.example</code>): <code>NOTION_TOKEN</code>, <code>NOTION_DATABASE_ID</code>, and that the
        database is shared with your integration.
      </p>
    </div>
  );
}
