import { createClient } from "@/lib/supabase/server";

/**
 * Vérifie si l'assistant IA est activé pour ce déploiement.
 * Lit voice_assistant_enabled depuis la table app_settings.
 */
export async function getAiEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "voice_assistant_enabled")
      .maybeSingle();
    return data?.value === true || data?.value === "true";
  } catch {
    return false;
  }
}
