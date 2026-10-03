import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/yazz/types/database";

/**
 * Supabase client côté navigateur — SINGLETON.
 * Un seul client partagé entre tous les hooks pour que le WebSocket
 * Realtime ne soit ouvert qu'une seule fois et reste connecté.
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

// Singleton — une seule instance partagée
let _client: SupabaseClient<Database> | null = null;

function getOrCreateClient(): SupabaseClient<Database> {
  if (_client) return _client;

  _client = createSupabaseClient<Database>(
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
  return _client;
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase client appelé sans variables d'environnement. " +
      "Configurez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local"
    );
  }
  return getOrCreateClient();
}

export function createClientSafe() {
  if (!isSupabaseConfigured()) return null;
  return getOrCreateClient();
}
