"use client";

import { useState } from "react";
import {
  ChevronDown,
  MessageCircle,
  Mail,
  Phone,
  ExternalLink,
  LifeBuoy,
  HelpCircle,
  Shield,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FaqItem = {
  q: string;
  a: string;
};

const FAQ: FaqItem[] = [
  {
    q: "Comment ajouter un nouveau capteur GPS ?",
    a: "Allez dans « Mes véhicules » → cliquez sur « Ajouter ». Saisissez l'IMEI du capteur (5 à 20 chiffres, indiqué sur le boîtier ou dans les paramètres du fabricant) puis complétez les informations du véhicule (nom, plaque, marque, modèle, couleur). Le capteur sera actif immédiatement et commencera à envoyer sa position dans les 30 secondes.",
  },
  {
    q: "Combien coûte le suivi GPS ?",
    a: "Le suivi GPS fonctionne avec un système de crédit en CDF (Francs Congolais). Chaque jour, une petite somme est déduite de votre solde selon votre plan. Quand votre solde est épuisé, le suivi s'arrête. Rechargez via Mobile Money (M-Pesa, Airtel Money, Orange Money) dans la section « Paiements ».",
  },
  {
    q: "Comment fonctionne le coupe-moteur ?",
    a: "Sur la page Détail d'un véhicule, cliquez sur « Coupe-moteur ». Une commande est envoyée au capteur qui coupe l'allumage du moteur. Le véhicule ne pourra plus démarrer tant que vous ne cliquez pas sur « Restaurer ». Pour des raisons de sécurité, le coupe-moteur est désactivé si le véhicule roule à plus de 20 km/h. Disponible uniquement sur les capteurs iStartek.",
  },
  {
    q: "Que faire si la position de mon véhicule ne se met plus à jour ?",
    a: "Plusieurs causes possibles : (1) Le capteur est hors-ligne (vérifiez le statut dans la liste). (2) La batterie du capteur est faible. (3) Le solde de crédit est épuisé (vérifiez dans le dashboard). (4) Le capteur n'a pas de réseau GSM. Si le problème persiste, contactez le support via WhatsApp.",
  },
  {
    q: "Comment activer le mode parking antivol ?",
    a: "Le mode parking surveille votre véhicule à l'arrêt et déclenche une alerte sonore si quelqu'un tente de le déplacer. Cette fonctionnalité sera disponible prochainement dans la section dédiée. En attendant, vous recevez déjà des notifications push si un mouvement non autorisé est détecté.",
  },
  {
    q: "Comment partager mon véhicule avec un proche ?",
    a: "Allez sur le Détail d'un véhicule → cliquez sur « Partager ». Saisissez le numéro de téléphone de la personne, choisissez les permissions (consultation seule ou consultation + alertes), et définissez une durée. La personne recevra une invitation. Cette fonctionnalité sera bientôt disponible.",
  },
  {
    q: "Pourquoi mon solde baisse-t-il même sans utilisation ?",
    a: "Le suivi GPS est un service continu : tant que votre capteur envoie des positions, une petite somme est déduite chaque jour pour couvrir les frais d'infrastructure (serveurs, bande passante, stockage des positions). Si vous n'utilisez plus un capteur, désactivez-le dans « Mes véhicules » pour stopper la facturation.",
  },
  {
    q: "Mes données sont-elles sécurisées ?",
    a: "Oui. Toutes les communications sont chiffrées (HTTPS/WSS). Vos données sont stockées sur Supabase avec Row Level Security (RLS) : chaque utilisateur ne peut voir que ses propres véhicules et positions. Le backend YAZZ est hébergé en Europe (Supabase eu-west-1). Vos mots de passe sont hashés avec bcrypt via Supabase Auth.",
  },
];

export default function HelpPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-yazz-lg yazz-gradient-primary text-white shadow-yazz-medium">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Aide & support
            </h1>
            <p className="font-inter text-[13px] text-yazz-text-muted">
              Trouvez rapidement des réponses ou contactez notre équipe.
            </p>
          </div>
        </div>

        {/* Quick contacts */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <ContactCard
            icon={MessageCircle}
            label="WhatsApp"
            description="Réponse en quelques minutes"
            color="bg-yazz-whatsapp"
            href="https://wa.me/243986842924?text=Bonjour%20YAZZ%2C%20j%27ai%20besoin%20d%27aide"
            external
          />
          <ContactCard
            icon={Mail}
            label="Email"
            description="support@yazz.app"
            color="bg-yazz-info"
            href="mailto:support@yazz.app"
            external
          />
          <ContactCard
            icon={Phone}
            label="Téléphone"
            description="+243 986 842 924"
            color="bg-yazz-primary"
            href="tel:+243986842924"
            external
          />
        </div>

        {/* FAQ */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-yazz-primary" />
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Questions fréquentes
            </h2>
          </div>

          <ul className="space-y-2">
            {FAQ.map((item, idx) => {
              const isOpen = openIdx === idx;
              return (
                <li
                  key={idx}
                  className="overflow-hidden rounded-yazz-md border border-yazz-border-light bg-yazz-surface yazz-shadow-soft"
                >
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="font-inter flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-yazz-accent"
                  >
                    <span className="font-outfit text-[13px] font-semibold tracking-[-0.01em] text-yazz-text-dark">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-yazz-text-muted transition-transform",
                        isOpen && "rotate-180 text-yazz-primary"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="yazz-animate-fade-in-up border-t border-yazz-border-light px-3 py-3">
                      <p className="font-inter text-[12px] leading-relaxed text-yazz-text-body">
                        {item.a}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Liens légaux */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-yazz-primary" />
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Documents légaux
            </h2>
          </div>
          <ul className="space-y-2">
            <LegalLink icon={Shield} label="Politique de confidentialité" />
            <LegalLink icon={FileText} label="Conditions générales d'utilisation" />
            <LegalLink icon={FileText} label="Mentions légales" />
          </ul>
        </div>

        {/* Footer */}
        <div className="rounded-yazz-md yazz-gradient-subtle p-4 text-center">
          <p className="font-outfit text-[14px] font-bold text-yazz-text-dark">YAZZ GPS Tracking</p>
          <p className="font-inter mt-1 text-[11px] text-yazz-text-muted">
            Plateforme de suivi GPS temps réel pour véhicules en RDC.
          </p>
          <p className="font-inter mt-2 text-[10px] text-yazz-text-caption">
            © 2026 YAZZ · Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  label,
  description,
  color,
  href,
  external,
}: {
  icon: any;
  label: string;
  description: string;
  color: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex items-center gap-3 rounded-yazz-md border border-yazz-border-light bg-yazz-surface p-3 yazz-shadow-soft transition-all hover:-translate-y-0.5 hover:yazz-shadow-elevated"
    >
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg text-white", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="font-outfit text-[13px] font-bold tracking-[-0.01em] text-yazz-text-dark">{label}</p>
          {external && <ExternalLink className="h-3 w-3 text-yazz-text-caption" />}
        </div>
        <p className="font-inter text-[10px] text-yazz-text-muted">{description}</p>
      </div>
    </a>
  );
}

function LegalLink({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <li>
      <button className="font-inter flex w-full items-center justify-between gap-3 rounded-yazz-md border border-yazz-border-light bg-yazz-surface p-3 text-left transition-colors hover:bg-yazz-accent">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-yazz-text-muted" />
          <span className="font-inter text-[12px] font-medium text-yazz-text-body">{label}</span>
        </div>
        <ExternalLink className="h-3 w-3 text-yazz-text-caption" />
      </button>
    </li>
  );
}
