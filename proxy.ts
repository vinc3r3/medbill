// Runs before matching requests: refreshes the Supabase session cookie and redirects signed-out visitors
// away from app pages. This is an optimistic check only; every page and route verifies the user itself.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_PAGES = ['/signin', '/signup'];
const PUBLIC_PAGES = ['/', ...AUTH_PAGES];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response; // misconfigured: pages/routes will report it

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // Do not run code between creating the client and getClaims(): it refreshes the session if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  if (!signedIn && !isApi && !PUBLIC_PAGES.includes(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = '/signin';
    to.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return response;
}

export const config = {
  // Everything except static assets, OCR files and the signature-verified webhooks.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|tesseract/|api/mail-webhook|api/stripe-webhook).*)'],
};
