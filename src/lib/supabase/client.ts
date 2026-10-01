import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/yazz/types/database";

/**
 * Client Supabase côté navigateur.
 * Utilisé dans les Client Components pour :
 *   - Auth (signIn, signUp, signOut, onAuthStateChange)
 *   - Realtime subscriptions
 *   - Queries directes (avec RLS appliquée automatiquement)
 *
 * ⚠️ N'utiliser QUE l'anon key côté client.
 * Ne jamais importer la service_role key dans ce fichier.
 *
 * Si les variables d'env ne sont pas configurées (mode démo),
 * `isSupabaseConfigured()` retourne false et le client n'est pas créé.
 */

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    !!url &&
    !!key &&
    key !== "your_anon_key_here" &&
    key.length > 10
  );
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase client appelé sans variables d'environnement. " +
      "Configurez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local"
    );
  }
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}

/**
 * Crée un client Supabase safe — retourne null si pas configuré.
 * À utiliser dans les hooks/components qui doivent fonctionner en mode démo.
 */
export function createClientSafe() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}
