import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/yazz/types/database";

/**
 * Middleware Supabase — refresh token + protection des routes.
 *
 * Toutes les routes sauf /login et /api/auth/* nécessitent une session valide.
 * Sinon, redirige vers /login.
 *
 * Si Supabase n'est pas configuré (variables d'env manquantes),
 * le middleware désactive la protection et laisse l'app tourner en mode démo.
 */
export async function updateSession(request: NextRequest) {
  // Vérifier que Supabase est configuré
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isSupabaseConfigured =
    !!supabaseUrl &&
    !!supabaseAnonKey &&
    supabaseAnonKey !== "your_anon_key_here" &&
    supabaseAnonKey.length > 10;

  // Mode démo : pas de protection des routes
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() doit être appelé pour rafraîchir le token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes publiques
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/api/") ||  // toutes les routes API gèrent leur propre auth
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$/);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Si déjà connecté et sur /login → rediriger vers dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
