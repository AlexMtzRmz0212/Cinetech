import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { importEntries, type SlimMovie } from "@/lib/sync/importEntries";
import type { ImportEntry } from "@/lib/types";

export const maxDuration = 60;

/**
 * Step 2: write a small batch of entries to Notion (create new movies, update existing ones).
 * `recent` carries the rows earlier batches of the same run touched, so they are matched
 * even when Notion hasn't listed them yet.
 */
export async function POST(request: Request) {
  try {
    const { entries, recent } = (await request.json()) as { entries?: ImportEntry[]; recent?: SlimMovie[] };
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 25) {
      return NextResponse.json({ error: "Send 1-25 entries per batch" }, { status: 400 });
    }
    const { outcomes, touched } = await importEntries(entries, Array.isArray(recent) ? recent : []);
    revalidatePath("/");
    revalidatePath("/stats");
    return NextResponse.json({ results: outcomes, touched });
  } catch (error) {
    return fail(error);
  }
}
