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

// Singleton via globalThis — évite les multiples instances quand Next.js
// bundle le module dans plusieurs chunks séparés
const g = globalThis as any;
if (!g.__yazzSupabaseClient) {
  g.__yazzSupabaseClient = null;
}

function getOrCreateClient(): SupabaseClient<Database> {
  if (g.__yazzSupabaseClient) return g.__yazzSupabaseClient;

  g.__yazzSupabaseClient = createSupabaseClient<Database>(
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
  return g.__yazzSupabaseClient;
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
