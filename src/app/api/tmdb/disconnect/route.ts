import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { tmdbAuth } from "@/lib/providers/tmdbAccount";
import { openUser, TMDB_USER_COOKIE } from "@/lib/tmdbUser";

/** Revoke the access token on TMDb (best effort) and forget it here. */
export async function POST() {
  const user = await openUser((await cookies()).get(TMDB_USER_COOKIE)?.value);
  if (user) await tmdbAuth("DELETE", "/auth/access_token", { access_token: user.accessToken }).catch(console.error);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(TMDB_USER_COOKIE);
  return res;
}
