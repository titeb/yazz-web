import Link from "next/link";
import { YazzLogo } from "@/components/yazz/yazz-logo";

/**
 * Page légale publique (sans connexion) : conditions d'utilisation,
 * confidentialité. Liens demandés par Google Play.
 */
export type LegalSection = { title: string; paragraphs: string[]; items?: string[] };

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  current,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  current: "conditions" | "confidentialite";
}) {
  return (
    <div className="min-h-screen bg-yazz-background">
      <header className="border-b border-yazz-border-light bg-yazz-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <YazzLogo />
          <nav className="font-inter flex gap-4 text-[13px] font-medium">
            <Link
              href="/conditions"
              className={current === "conditions" ? "text-yazz-primary" : "text-yazz-text-muted hover:text-yazz-primary"}
            >
              Conditions
            </Link>
            <Link
              href="/confidentialite"
              className={current === "confidentialite" ? "text-yazz-primary" : "text-yazz-text-muted hover:text-yazz-primary"}
            >
              Confidentialité
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-outfit text-[30px] font-bold leading-tight tracking-[-0.02em] text-yazz-text-dark">{title}</h1>
        <p className="font-inter mt-2 text-[13px] text-yazz-text-muted">Dernière mise à jour : {updated}</p>
        <p className="font-inter mt-6 text-[15px] leading-7 text-yazz-text-body">{intro}</p>

        {sections.map((s, i) => (
          <section key={s.title} className="mt-8">
            <h2 className="font-outfit text-[19px] font-semibold text-yazz-text-dark">
              {i + 1}. {s.title}
            </h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="font-inter mt-3 text-[15px] leading-7 text-yazz-text-body">
                {p}
              </p>
            ))}
            {s.items && (
              <ul className="font-inter mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-yazz-text-body">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <footer className="font-inter mt-12 border-t border-yazz-border-light pt-6 text-[13px] text-yazz-text-muted">
          YAZZ — Kinshasa, République démocratique du Congo · Contact : support@yazz.com, ou dans l’application
          (Paramètres → Aide &amp; À propos).
        </footer>
      </main>
    </div>
  );
}
