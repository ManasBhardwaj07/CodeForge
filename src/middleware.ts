import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check for the presence of the token cookie
  const token = request.cookies.get("token")?.value;

  // We only check for presence here to avoid duplicating JWT verification logic in Edge.
  // The actual signature verification happens in the API routes / server actions via requireAuth().
  if (!token) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Add any protected UI or API routes here
  matcher: ["/submissions", "/api/submit", "/api/run", "/api/my-submissions"],
};
