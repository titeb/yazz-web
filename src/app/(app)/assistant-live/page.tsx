"use client";

/**
 * Accès direct à la conversation vocale en direct (bêta). Le chemin habituel
 * est le bouton « Parler en direct » de l'assistant. Ici, l'appel démarre au
 * clic sur « Démarrer » (le navigateur exige un geste pour le son et le micro).
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const YazzLiveVoice = dynamic(
  () => import("@/components/yazz/yazz-live-voice").then((m) => m.YazzLiveVoice),
  { ssr: false },
);

export default function AssistantLivePage() {
  const router = useRouter();
  return <YazzLiveVoice autoStart={false} onClose={() => router.push("/")} />;
}
