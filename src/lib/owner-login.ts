/**
 * Connexion de test sans SMS sur ce navigateur (période de test).
 *
 * La clé n'est jamais dans le code du site. Le lien donné par yazz-admin
 * (Paramètres → Sécurité → Connexion de test) : https://…/login#cle=…&tel=…
 * (la partie après # n'est jamais envoyée à un serveur). Ouvert dans un
 * navigateur, il connecte tout de suite au compte du propriétaire, sans SMS,
 * et garde la clé : ensuite, en tapant ce numéro, le code est récupéré et
 * rempli tout seul. Désactivée dans yazz-admin
 * (ou pas encore connue du serveur, moins d'une minute après sa création) : la
 * clé est refusée, rien n'est rempli et le SMS arrive normalement.
 */
const STORAGE_KEY = "yazz_owner_login_key";
const KEY_RE = /^[0-9a-f]{64}$/;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Lien « #cle=…&tel=… » ouvert : clé gardée, puis retirée de l'adresse.
 * → null (pas de lien) | { phone } (numéro à connecter tout de suite, ou null)
 */
export function captureOwnerKeyFromUrl(): { phone: string | null } | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  const match = hash.match(/(?:^#|&)cle=([0-9a-f]{64})(?:&|$)/);
  if (!match) return null;
  storage()?.setItem(STORAGE_KEY, match[1]);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  const tel = hash.match(/(?:^#|&)tel=(\d{8,15})(?:&|$)/);
  return { phone: tel ? tel[1] : null };
}

export function ownerLoginKey(): string | null {
  const v = storage()?.getItem(STORAGE_KEY) ?? null;
  return v && KEY_RE.test(v) ? v : null;
}

export function forgetOwnerLoginKey() {
  storage()?.removeItem(STORAGE_KEY);
}

/**
 * Code gardé par le serveur pour ce numéro : le code ; null (pas encore) ;
 * false (clé refusée : inutile de réessayer, le SMS arrive).
 */
export async function fetchOwnerCode(phone: string, key: string): Promise<string | null | false> {
  try {
    const res = await fetch("/api/auth/trusted-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.replace(/\D/g, ""), deviceToken: key }),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 429) return false;
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.code === "string" && /^\d{6}$/.test(data.code) ? data.code : null;
  } catch {
    return null;
  }
}

/** Plusieurs essais (le code arrive en moins d'une seconde ; SMS après 15 s). */
export async function waitOwnerCode(
  phone: string,
  key: string,
  { tries = 6, everyMs = 2000, cancelled = () => false }: { tries?: number; everyMs?: number; cancelled?: () => boolean } = {}
): Promise<string | null> {
  for (let i = 0; i < tries && !cancelled(); i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, everyMs));
    if (cancelled()) return null;
    const code = await fetchOwnerCode(phone, key);
    if (code === false) return null; // clé refusée
    if (code) return code;
  }
  return null;
}
