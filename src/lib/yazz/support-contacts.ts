"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClientSafe } from "@/lib/supabase/client";

/**
 * Contacts du service client (WhatsApp, appel, e-mail, site web).
 *
 * Réglés dans yazz-admin (Paramètres → Général → Service client), rangés
 * dans la table app_config (clé « support ») — la même source que l'app
 * mobile. Le site les suit en direct ; une valeur absente ou mal écrite
 * retombe sur la valeur par défaut (jamais de contact vide).
 */
export type SupportContacts = {
  /** Format international sans « + » (ex. 243986842924). */
  whatsapp: string;
  phone: string;
  email: string;
  /** Adresse complète (https://…). */
  website: string;
};

export const DEFAULT_SUPPORT: SupportContacts = {
  whatsapp: "243986842924",
  phone: "243986842924",
  email: "support@yazz.com",
  website: "https://yazz-web.vercel.app",
};

function cleanNumber(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = String(v).replace(/\D/g, "");
  return d.length >= 6 && d.length <= 15 ? d : null;
}

function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

function cleanWebsite(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let w = v.trim();
  if (!w || /\s/.test(w)) return null;
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  try {
    const u = new URL(w);
    return ["http:", "https:"].includes(u.protocol) && u.hostname.includes(".") ? w : null;
  } catch {
    return null;
  }
}

export function resolveSupportContacts(raw: unknown): SupportContacts {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const whatsapp = cleanNumber(s.whatsapp) ?? DEFAULT_SUPPORT.whatsapp;
  return {
    whatsapp,
    phone: cleanNumber(s.phone) ?? whatsapp,
    email: cleanEmail(s.email) ?? DEFAULT_SUPPORT.email,
    website: cleanWebsite(s.website) ?? DEFAULT_SUPPORT.website,
  };
}

/** « +243 986 842 924 » (numéros de RDC), sinon « + » suivi des chiffres. */
export function displayNumber(digits: string): string {
  return digits.length === 12 && digits.startsWith("243")
    ? `+243 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : `+${digits}`;
}

export function whatsappLink(contacts: SupportContacts, message: string): string {
  return `https://wa.me/${contacts.whatsapp}?text=${encodeURIComponent(message)}`;
}

/** Contacts du service client, à jour en direct quand l'admin les change. */
export function useSupportContacts(): SupportContacts {
  const [contacts, setContacts] = useState<SupportContacts>(DEFAULT_SUPPORT);

  useEffect(() => {
    // Table absente des types générés : client non typé pour cette lecture.
    const sb = createClientSafe() as unknown as SupabaseClient | null;
    if (!sb) return;
    let alive = true;

    const load = async () => {
      try {
        const { data } = await sb.from("app_config").select("value").eq("key", "support").maybeSingle();
        if (alive) setContacts(resolveSupportContacts(data?.value));
      } catch {
        // Hors ligne : on garde les valeurs connues.
      }
    };
    void load();

    const channel = sb
      .channel(`support-contacts-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config", filter: "key=eq.support" },
        () => void load(),
      )
      .subscribe();

    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, []);

  return contacts;
}
