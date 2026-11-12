import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Conditions d’utilisation — YAZZ",
  description: "Conditions d’utilisation de l’application et du site YAZZ (suivi GPS de véhicules).",
};

export default function ConditionsPage() {
  return (
    <LegalPage
      current="conditions"
      title="Conditions d’utilisation"
      updated="12 novembre 2026"
      intro="Les présentes conditions s’appliquent à l’application mobile YAZZ et au site YAZZ (ensemble : « le service »). En créant un compte ou en utilisant le service, vous les acceptez."
      sections={[
        {
          title: "Le service",
          paragraphs: [
            "YAZZ est un service de géolocalisation qui permet de suivre des véhicules et des équipements équipés d’un traceur GPS : position en temps réel, historique des trajets, alertes (sortie de zone, vitesse, alimentation, capteur déconnecté…), partage avec des proches et, selon le traceur, certaines commandes à distance.",
          ],
        },
        {
          title: "Compte",
          paragraphs: [
            "Le compte est créé avec un numéro de téléphone, confirmé par un code reçu par SMS. Vous êtes responsable de l’accès à votre compte et de tout ce qui y est fait. Ne partagez pas vos codes de connexion.",
          ],
        },
        {
          title: "Utilisation autorisée",
          paragraphs: ["Vous vous engagez à utiliser le service de façon légale. En particulier :"],
          items: [
            "suivre uniquement des véhicules ou équipements dont vous êtes propriétaire, ou pour lesquels vous avez l’autorisation de leur propriétaire ;",
            "ne jamais utiliser le service pour suivre une personne à son insu ;",
            "ne pas tenter de perturber le service, ni d’accéder aux données d’autres utilisateurs.",
          ],
        },
        {
          title: "Partage",
          paragraphs: [
            "Vous pouvez donner accès à un véhicule à d’autres personnes. Elles voient alors ses informations selon les droits que vous leur accordez. Vous pouvez arrêter un partage à tout moment.",
          ],
        },
        {
          title: "Commandes à distance",
          paragraphs: [
            "Certaines fonctions agissent sur le véhicule (par exemple la coupure du moteur). Utilisez-les avec prudence et dans le respect de la sécurité de tous. Vous êtes responsable de leur usage.",
          ],
        },
        {
          title: "Crédits et paiements",
          paragraphs: [
            "Le suivi fonctionne avec des crédits rechargeables. Les notifications de l’application sont gratuites ; les alertes par SMS ou WhatsApp, si vous les choisissez, sont décomptées à l’usage. Les tarifs en vigueur sont indiqués dans l’application avant tout paiement. Les paiements se font avec les moyens proposés dans l’application.",
          ],
        },
        {
          title: "Disponibilité et précision",
          paragraphs: [
            "Le service dépend des réseaux mobiles, du signal GPS et du bon fonctionnement du traceur. Des interruptions ou des imprécisions de position peuvent survenir. YAZZ fait de son mieux pour assurer un service continu, mais ne peut pas le garantir en toutes circonstances.",
            "L’assistant de l’application, lorsqu’il est disponible, produit des réponses automatiques qui peuvent contenir des erreurs : vérifiez les informations importantes.",
          ],
        },
        {
          title: "Responsabilité",
          paragraphs: [
            "YAZZ est un outil d’aide au suivi et ne remplace ni une assurance, ni les forces de l’ordre. Dans les limites permises par la loi, YAZZ n’est pas responsable des dommages résultant d’une interruption du service, d’une position imprécise ou d’une utilisation contraire aux présentes conditions.",
          ],
        },
        {
          title: "Données personnelles",
          paragraphs: [
            "Les données collectées et la façon dont elles sont utilisées sont décrites dans la politique de confidentialité : yazz-web.vercel.app/confidentialite.",
          ],
        },
        {
          title: "Fin d’utilisation",
          paragraphs: [
            "Vous pouvez cesser d’utiliser le service et demander la suppression de votre compte à tout moment en nous contactant. YAZZ peut suspendre un compte utilisé contrairement aux présentes conditions.",
          ],
        },
        {
          title: "Modifications",
          paragraphs: [
            "Ces conditions peuvent évoluer. La date de dernière mise à jour figure en haut de cette page ; en cas de changement important, vous en serez informé dans l’application.",
          ],
        },
        {
          title: "Droit applicable et contact",
          paragraphs: [
            "Ces conditions sont régies par le droit de la République démocratique du Congo. Pour toute question : support@yazz.com, ou depuis l’application (Paramètres → Aide & À propos).",
          ],
        },
      ]}
    />
  );
}
