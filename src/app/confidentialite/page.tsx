import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité — YAZZ",
  description: "Données collectées par YAZZ, utilisation, conservation et droits des utilisateurs.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      current="confidentialite"
      title="Politique de confidentialité"
      updated="12 novembre 2026"
      intro="Cette politique explique quelles données YAZZ collecte, pourquoi, combien de temps elles sont conservées et quels sont vos droits. Vos données ne sont jamais vendues."
      sections={[
        {
          title: "Données collectées",
          paragraphs: [],
          items: [
            "Compte : numéro de téléphone, et si vous les indiquez, nom et adresse e-mail.",
            "Véhicules : informations envoyées par le traceur GPS (positions, vitesse, état du contact, tension de la batterie…), nom et photos du véhicule que vous ajoutez.",
            "Utilisation : lieux enregistrés, zones, réglages d’alertes, partages, historique des notifications et des crédits.",
            "Téléphone : identifiant technique pour recevoir les notifications ; si vous l’autorisez, la position du téléphone pour certaines fonctions (par exemple l’itinéraire vers votre véhicule).",
            "Assistant (lorsqu’il est disponible) : vos questions écrites ou vocales, pour y répondre.",
          ],
        },
        {
          title: "Pourquoi",
          paragraphs: [
            "Ces données servent uniquement à fournir le service : afficher vos véhicules et leurs trajets, envoyer vos alertes, gérer votre compte, vos crédits et vos partages, assurer la sécurité et corriger les problèmes.",
          ],
        },
        {
          title: "Conservation",
          paragraphs: [
            "Les positions GPS détaillées sont conservées 30 jours, puis supprimées automatiquement. Les échanges avec l’assistant sont gardés au plus 24 heures pour la continuité de la conversation. Les autres informations sont conservées tant que votre compte existe, sauf obligation légale contraire.",
          ],
        },
        {
          title: "Partage",
          paragraphs: [
            "Vos données ne sont visibles que par vous et par les personnes avec qui vous partagez un véhicule. YAZZ fait appel à des prestataires techniques, uniquement pour faire fonctionner le service :",
          ],
          items: [
            "hébergement de la base de données et des serveurs ;",
            "envoi des notifications (Google Firebase), des SMS et des messages WhatsApp ;",
            "cartes et adresses (Mapbox) ;",
            "paiement mobile ;",
            "assistant (services d’intelligence artificielle) et suivi des erreurs techniques.",
          ],
        },
        {
          title: "Sécurité",
          paragraphs: [
            "Les échanges sont chiffrés (HTTPS) et l’accès aux données est limité à votre compte et aux personnes que vous autorisez.",
          ],
        },
        {
          title: "Vos droits",
          paragraphs: [
            "Vous pouvez demander à consulter, corriger ou supprimer vos données, ou supprimer votre compte, en écrivant à support@yazz.com ou depuis l’application (Paramètres → Aide & À propos). Vous pouvez aussi retirer à tout moment les autorisations du téléphone (position, notifications, micro) dans ses réglages.",
          ],
        },
        {
          title: "Enfants",
          paragraphs: ["Le service n’est pas destiné aux enfants de moins de 13 ans."],
        },
        {
          title: "Modifications",
          paragraphs: [
            "Cette politique peut évoluer. La date de dernière mise à jour figure en haut de cette page.",
          ],
        },
      ]}
    />
  );
}
