"use client";

/**
 * Lien direct vers l'assistant Yazz (conversation vocale en direct). Le
 * chemin habituel est le bouton de l'assistant sur la carte. Ici, l'appel
 * démarre au clic sur « Démarrer » (le navigateur exige un geste pour le son
 * et le micro).
 */
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAssistantVisible } from "@/hooks/use-assistant-visible";

const YazzLiveVoice = dynamic(
  () => import("@/components/yazz/yazz-live-voice").then((m) => m.YazzLiveVoice),
  { ssr: false },
);

export default function AssistantLivePage() {
  const router = useRouter();
  // Assistant caché pour ce compte (yazz-admin → Assistant IA) : retour à l'accueil
  const { visible, ready } = useAssistantVisible();
  useEffect(() => {
    if (ready && !visible) router.replace("/");
  }, [ready, visible, router]);
  if (!ready || !visible) return null;
  return <YazzLiveVoice autoStart={false} onClose={() => router.push("/")} />;
}
