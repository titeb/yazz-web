import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/yazz/types/database";

/**
 * Client Supabase côté serveur (Server Components, Route Handlers, Server Actions).
 * Gère automatiquement les cookies de session.
 *
 * Pour les opérations privilégiées (admin), utilise createAdminClient() ci-dessous.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignoré — appelé depuis un Server Component, ne peut pas set cookies
            // Le middleware s'en chargera au prochain refresh
          }
        },
      },
    }
  );
}

/**
 * Client Supabase admin (service_role key — bypass RLS).
 * À utiliser UNIQUEMENT pour :
 *   - Opérations admin (cascade delete, batch updates)
 *   - Routes API serveur protégées par verifyAdmin()
 *
 * ⚠️ JAMAIS exposer ce client au navigateur.
 */
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op — admin client n'a pas besoin de cookies
        },
      },
    }
  );
}
