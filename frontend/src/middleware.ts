import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes
  if (pathname === "/" || pathname === "/auth-popup" || pathname === "/auth-popup-callback") {
    return NextResponse.next();
  }

  // /login redirects to landing page with login modal open
  if (pathname === "/login") {
    const url = new URL("/?login=true", req.url);
    return NextResponse.redirect(url);
  }

  // Protected routes: redirect unauthenticated users to landing with login modal
  if (!req.auth) {
    const url = new URL("/?login=true", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
