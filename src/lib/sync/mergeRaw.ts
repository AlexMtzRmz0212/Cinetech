import type { NotionAny } from "../notion/client";

/** Property types that can't be written (computed or system-owned) or that a merge can't sensibly combine. */
const SKIP_TYPES = new Set(["title", "formula", "rollup", "created_time", "last_edited_time", "created_by", "last_edited_by", "unique_id", "status", "button", "verification", "files"]);

const plain = (items: NotionAny[] | undefined) => (items ?? []).map((t) => t.plain_text ?? "").join("");

/** Notion rich text as it can be sent back: text items only, mentions and equations flattened to their plain text. */
const writable = (items: NotionAny[] | undefined): NotionAny[] =>
  (items ?? []).map((t) =>
    t.type === "text"
      ? { type: "text", text: { content: t.text.content, link: t.text.link ?? null }, annotations: t.annotations }
      : { type: "text", text: { content: t.plain_text ?? "" } },
  );

const ids = (list: NotionAny[] | undefined) => (list ?? []).map((x) => x.id as string);

/**
 * Columns the app does not manage (Platform, Watched with, Notes/Comments, …) would be lost when duplicates are
 * merged, so combine them: the kept row gets whatever it lacks, lists are unioned, text is appended, a ticked box stays ticked.
 * Returns a Notion `properties` payload with only the columns that actually change.
 */
export function mergeRawProperties(keep: NotionAny, others: NotionAny[], skipNames: Set<string>): Record<string, NotionAny> {
  const out: Record<string, NotionAny> = {};
  const names = new Set([keep, ...others].flatMap((props) => Object.keys(props ?? {})));

  for (const name of names) {
    if (skipNames.has(name)) continue;
    const mine = keep?.[name];
    const theirs = others.map((o) => o?.[name]).filter(Boolean);
    const type: string | undefined = (mine ?? theirs[0])?.type;
    if (!type || SKIP_TYPES.has(type)) continue;

    switch (type) {
      case "select": {
        if (mine?.select?.name) break;
        const found = theirs.find((p) => p.select?.name);
        if (found) out[name] = { select: { name: found.select.name } };
        break;
      }
      case "multi_select": {
        const have = new Set<string>((mine?.multi_select ?? []).map((o: NotionAny) => o.name));
        const all = new Set(have);
        for (const p of theirs) for (const o of p.multi_select ?? []) all.add(o.name);
        if (all.size > have.size) out[name] = { multi_select: [...all].map((n) => ({ name: n })) };
        break;
      }
      case "rich_text": {
        const base = plain(mine?.rich_text).trim();
        const seen = new Set([base]);
        const extra: string[] = [];
        for (const p of theirs) {
          const t = plain(p.rich_text).trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            extra.push(t);
          }
        }
        if (!extra.length) break;
        const joined = base ? [...writable(mine.rich_text), { type: "text", text: { content: "\n" + extra.join("\n") } }] : [{ type: "text", text: { content: extra.join("\n") } }];
        out[name] = { rich_text: joined.slice(0, 100) };
        break;
      }
      case "number": {
        if (typeof mine?.number === "number") break;
        const found = theirs.find((p) => typeof p.number === "number");
        if (found) out[name] = { number: found.number };
        break;
      }
      case "checkbox": {
        if (!mine?.checkbox && theirs.some((p) => p.checkbox)) out[name] = { checkbox: true };
        break;
      }
      case "date": {
        if (mine?.date) break;
        const found = theirs.find((p) => p.date);
        if (found) out[name] = { date: { start: found.date.start, end: found.date.end ?? null, time_zone: found.date.time_zone ?? null } };
        break;
      }
      case "url":
      case "email":
      case "phone_number": {
        if (mine?.[type]) break;
        const found = theirs.find((p) => p[type]);
        if (found) out[name] = { [type]: found[type] };
        break;
      }
      case "people":
      case "relation": {
        const have = ids(mine?.[type]);
        const all = new Set(have);
        for (const p of theirs) for (const id of ids(p[type])) all.add(id);
        if (all.size > have.length) out[name] = { [type]: [...all].map((id) => ({ id })) };
        break;
      }
    }
  }
  return out;
}
