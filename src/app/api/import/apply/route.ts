import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { importEntries } from "@/lib/sync/importEntries";
import type { ImportEntry } from "@/lib/types";

export const maxDuration = 60;

/** Step 2: write a small batch of entries to Notion (create new movies, update existing ones). */
export async function POST(request: Request) {
  try {
    const { entries } = (await request.json()) as { entries?: ImportEntry[] };
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 25) {
      return NextResponse.json({ error: "Send 1-25 entries per batch" }, { status: 400 });
    }
    const results = await importEntries(entries);
    revalidatePath("/");
    revalidatePath("/stats");
    return NextResponse.json({ results });
  } catch (error) {
    return fail(error);
  }
}
