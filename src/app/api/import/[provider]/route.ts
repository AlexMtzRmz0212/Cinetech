import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getProvider } from "@/lib/providers/registry";
import type { ImportEntry } from "@/lib/types";

export const maxDuration = 30;

/**
 * Step 1 of an import: turn uploaded files (multipart `file`, one or more) or an account
 * (JSON `{ username }`) into normalised entries. Nothing is written yet; the browser then
 * sends them in small batches to /api/import/apply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider?.import) return NextResponse.json({ error: "Unknown import source" }, { status: 404 });

    const entries: ImportEntry[] = [];
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const files = (await request.formData()).getAll("file").filter((f): f is File => f instanceof File);
      if (files.length === 0) return NextResponse.json({ error: "Attach at least one file" }, { status: 400 });
      for (const file of files) {
        try {
          entries.push(...(await provider.import({ kind: "file", name: file.name, data: await file.arrayBuffer() })));
        } catch (error) {
          throw new Error(`${file.name}: ${error instanceof Error ? error.message : error}`);
        }
      }
    } else {
      const { username } = (await request.json().catch(() => ({}))) as { username?: string };
      entries.push(...(await provider.import({ kind: "account", username })));
    }
    // Watched before Watchlist, so a film in both ends up Watched whatever the file order.
    entries.sort((a, b) => Number(a.status === "Watchlist") - Number(b.status === "Watchlist"));
    return NextResponse.json({ entries });
  } catch (error) {
    return fail(error, 400);
  }
}
