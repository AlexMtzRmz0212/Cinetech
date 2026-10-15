import { NextResponse, type NextRequest } from "next/server";
import { tmdbAuth } from "@/lib/providers/tmdbAccount";
import { cookieOptions, sealUser, TMDB_REQUEST_COOKIE, TMDB_USER_COOKIE } from "@/lib/tmdbUser";

/** Step 2: TMDb sends you back here once approved; swap the request token for your access token. */
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/sync?tmdb=${result}`, request.nextUrl.origin));
    res.cookies.delete(TMDB_REQUEST_COOKIE);
    return res;
  };
  const requestToken = request.cookies.get(TMDB_REQUEST_COOKIE)?.value;
  if (!requestToken) return back("expired");
  try {
    const { access_token, account_id } = await tmdbAuth<{ access_token: string; account_id: string }>("POST", "/auth/access_token", {
      request_token: requestToken,
    });
    const res = back("connected");
    res.cookies.set(TMDB_USER_COOKIE, await sealUser({ accessToken: access_token, accountId: account_id }), cookieOptions(60 * 60 * 24 * 365));
    return res;
  } catch (error) {
    console.error(error);
    return back("denied"); // not approved, or the token expired
  }
}
