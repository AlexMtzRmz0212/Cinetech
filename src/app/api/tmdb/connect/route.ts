import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { tmdbAuth } from "@/lib/providers/tmdbAccount";
import { cookieOptions, TMDB_REQUEST_COOKIE } from "@/lib/tmdbUser";

/** Step 1 of connecting TMDb: get a request token and send you to TMDb to approve it. */
export async function GET(request: NextRequest) {
  try {
    const redirectTo = `${request.nextUrl.origin}/api/tmdb/callback`;
    const { request_token } = await tmdbAuth<{ request_token: string }>("POST", "/auth/request_token", { redirect_to: redirectTo });
    const res = NextResponse.redirect(`https://www.themoviedb.org/auth/access?request_token=${encodeURIComponent(request_token)}`);
    res.cookies.set(TMDB_REQUEST_COOKIE, request_token, cookieOptions(15 * 60)); // TMDb expires it after 15 min
    return res;
  } catch (error) {
    return fail(error);
  }
}
