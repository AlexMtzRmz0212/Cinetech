export function SetupError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="max-w-2xl rounded-md border border-danger/40 bg-danger/5 p-5 text-sm">
      <p className="mb-2 font-display text-2xl leading-none font-bold text-danger uppercase">Couldn&apos;t load your Notion library</p>
      <p className="mb-4 font-mono break-words text-text">{message}</p>
      <p className="text-muted">
        Check <code className="text-text">.env.local</code> (see <code className="text-text">.env.example</code>): <code className="text-text">NOTION_TOKEN</code>,{" "}
        <code className="text-text">NOTION_DATABASE_ID</code>, and that the database is shared with your integration.
      </p>
    </div>
  );
}
