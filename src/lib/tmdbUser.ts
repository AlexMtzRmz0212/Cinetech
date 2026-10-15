import { cookies } from "next/headers";
import { optional } from "./env";

/** The TMDb user access token, kept in an encrypted httpOnly cookie (or set in env). */
export const TMDB_USER_COOKIE = "tmdb_user";
/** The request token between "connect" and TMDb's redirect back; useless on its own. */
export const TMDB_REQUEST_COOKIE = "tmdb_req";

export interface TmdbUser {
  accessToken: string;
  accountId: string;
}

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

async function key(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`tmdb-user:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealUser(user: TmdbUser): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(JSON.stringify(user)));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function openUser(value: string | undefined): Promise<TmdbUser | null> {
  if (!value) return null;
  try {
    const [iv, data] = value.split(".").map(unb64);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), data);
    const user = JSON.parse(new TextDecoder().decode(plain)) as TmdbUser;
    return user.accessToken && user.accountId ? user : null;
  } catch {
    return null; // tampered, or SESSION_SECRET changed
  }
}

/** Env vars win, so a deployment can be connected without the browser flow. */
export async function tmdbUser(): Promise<TmdbUser | null> {
  const accessToken = optional("TMDB_USER_TOKEN");
  const accountId = optional("TMDB_ACCOUNT_ID");
  if (accessToken && accountId) return { accessToken, accountId };
  return openUser((await cookies()).get(TMDB_USER_COOKIE)?.value);
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
