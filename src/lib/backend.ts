/**
 * Adresse du serveur YAZZ (yazz_backend), utilisable aussi depuis le
 * navigateur. Pour viser un autre serveur (tests), renseigner
 * NEXT_PUBLIC_YAZZ_BACKEND_URL.
 */
export const BACKEND_URL = (process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online").replace(/\/$/, "");
