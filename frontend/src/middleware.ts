export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    // Protect all routes except: login, auth API, Next.js internals, static assets
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
