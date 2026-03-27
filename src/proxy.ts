import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";
import { cookies } from "next/headers";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "proxy" });

// ---------------------------------------------------------------------------
// Route Configuration
// Extend these arrays per-app. Keep this list minimal and explicit.
// ---------------------------------------------------------------------------
const protectedRoutes = ["/dashboard"];
const publicRoutes = ["/login", "/signup", "/"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((r) => path.startsWith(r));
  const isPublicRoute = publicRoutes.includes(path);

  // Read and decrypt the session cookie (optimistic check — no DB hit)
  const cookieStore = await cookies();
  const token = cookieStore.get("foundry.session")?.value;
  const session = await decrypt(token);

  // Unauthenticated user hitting a protected route → redirect to login
  if (isProtectedRoute && !session?.userId) {
    log.warn({ path }, "Unauthenticated access to protected route — redirecting to /login");
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Authenticated user hitting a public auth route → redirect to dashboard
  if (isPublicRoute && session?.userId && path !== "/") {
    log.debug({ path, userId: session.userId }, "Authenticated user on public route — redirecting to /dashboard");
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

// Run proxy on all routes except Next.js internals and static files
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};


