import { Client } from "@notionhq/client";
import { required } from "../env";
import { FIELDS, FIELD_KEYS } from "./schema";

// The SDK's response types are very deep unions; the mapper below validates shapes itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NotionAny = any;

let client: Client | undefined;
export const notion = (): Client => (client ??= new Client({ auth: required("NOTION_TOKEN") }));

interface Resolved {
  dataSourceId: string;
  titleProp: string;
  props: Record<string, string>; // existing property name -> type
  /** Option names of the Status column, in Notion's order. */
  statusOptions: string[];
}

let resolved: Promise<Resolved> | undefined;

/**
 * Notion's current API queries "data sources" rather than databases. Resolve the
 * configured database to its (first) data source, discover the title column, and
 * create any of our columns that are missing. Cached for the process lifetime
 * (call `refreshSchema` to pick up Status options added in Notion since).
 */
export function getSchema(): Promise<Resolved> {
  resolved ??= resolve().catch((error) => {
    resolved = undefined;
    throw error;
  });
  return resolved;
}

export function refreshSchema(): Promise<Resolved> {
  resolved = undefined;
  return getSchema();
}

async function resolve(): Promise<Resolved> {
  const n = notion();
  const databaseId = required("NOTION_DATABASE_ID");
  const db: NotionAny = await n.databases.retrieve({ database_id: databaseId });
  const dataSourceId: string = db.data_sources?.[0]?.id ?? databaseId;

  const ds: NotionAny = await n.dataSources.retrieve({ data_source_id: dataSourceId });
  const props: Record<string, string> = {};
  let titleProp = "";
  for (const [name, def] of Object.entries<NotionAny>(ds.properties)) {
    props[name] = def.type;
    if (def.type === "title") titleProp = name;
  }
  if (!titleProp) throw new Error("The Notion database has no title column");
  const statusDef = ds.properties[FIELDS.status.name];
  const statusOptions: string[] = (statusDef?.status?.options ?? statusDef?.select?.options ?? []).map((o: NotionAny) => o.name);

  const missing: Record<string, NotionAny> = {};
  for (const key of FIELD_KEYS) {
    const { name, type } = FIELDS[key];
    if (props[name] === undefined) {
      const createAs = type === "status" ? "select" : type; // Notion can't create status columns via the API
      missing[name] = { [createAs]: createAs === "number" ? { format: "number" } : {} };
    }
  }
  if (Object.keys(missing).length > 0) {
    await n.dataSources.update({ data_source_id: dataSourceId, properties: missing });
    for (const [name, def] of Object.entries(missing)) props[name] = Object.keys(def)[0];
  }

  return { dataSourceId, titleProp, props, statusOptions };
}
