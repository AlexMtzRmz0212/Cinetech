import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, gateEnabled, isPublicPath, verifySession } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (await verifySession(request.cookies.get(COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
