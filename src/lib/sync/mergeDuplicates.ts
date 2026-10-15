import { getSchema, notion, type NotionAny } from "../notion/client";
import { trashMovie, updateMovie } from "../notion/movies";
import { FIELDS, FIELD_KEYS } from "../notion/schema";
import type { Movie } from "../types";
import { planMerge } from "./dedupe";
import { mergeRawProperties } from "./mergeRaw";

/**
 * Merge one group of duplicate rows into the most complete one: every field any row has ends up on it
 * (the app's own fields via planMerge, every other Notion column via mergeRawProperties), then the rest go to the Notion trash.
 */
export async function mergeGroup(group: Movie[]): Promise<{ kept: string; trashed: string[]; columns: string[] }> {
  const { keep, trash, patch } = planMerge(group);
  const { titleProp } = await getSchema();
  const managed = new Set([titleProp, ...FIELD_KEYS.map((k) => FIELDS[k].name)]);

  const props = async (m: Movie): Promise<NotionAny> => ((await notion().pages.retrieve({ page_id: m.pageId! })) as NotionAny).properties;
  const [keepProps, ...otherProps] = await Promise.all([keep, ...trash].map(props));
  const extra = mergeRawProperties(keepProps, otherProps, managed);

  if (Object.keys(patch).length || Object.keys(extra).length) await updateMovie(keep.pageId!, patch, extra);
  for (const m of trash) await trashMovie(m.pageId!);
  return { kept: keep.pageId!, trashed: trash.map((m) => m.pageId!), columns: [...Object.keys(patch), ...Object.keys(extra)] };
}
