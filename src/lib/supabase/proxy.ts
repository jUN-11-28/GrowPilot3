import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Keeps the auth cookies fresh and performs an *optimistic* redirect for
 * unauthenticated visitors. This is a UX affordance only — every page, action
 * and route handler re-checks the user and resource ownership on the server.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Route Handlers answer with their own 401 JSON — never redirect an API call.
  if (pathname.startsWith("/api/")) return response;

  // Only ever redirect a navigation. A Server Action arrives as a POST to the
  // page's own path, and `NextResponse.redirect` answers it with a 307 that
  // replays the POST at the new path — the action never runs, and the client
  // gets a bogus "Server action not found" instead of its result. Signing in
  // from `/login` sets the session cookies *inside* the action, so this
  // request still looks unauthenticated here; letting it through is correct,
  // and every page and action re-checks the user server-side anyway.
  if (request.method !== "GET") return response;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
