import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/yazz/types/database";

/**
 * Supabase client côté navigateur.
 * Utilise @supabase/supabase-js directement (pas @supabase/ssr) car
 * @supabase/ssr createBrowserClient ne crée pas le WebSocket Realtime
 * automatiquement. @supabase/supabase-js gère le Realtime nativement.
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
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}

export function createClientSafe() {
  if (!isSupabaseConfigured()) return null;
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}
