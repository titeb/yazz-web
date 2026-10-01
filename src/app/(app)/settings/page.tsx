"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUserProfile } from "@/hooks/use-user-profile";
import { isSupabaseConfigured, createClientSafe } from "@/lib/supabase/client";
import {
  User as UserIcon,
  Mail,
  Phone,
  Bell,
  Shield,
  Languages,
  LogOut,
  Trash2,
  Loader2,
  AlertTriangle,
  Save,
  Snowflake,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const isReady = isSupabaseConfigured();
  const supabase = createClientSafe();
  const { profile, loading, error, updateProfile } = useUserProfile();

  const [fullName, setFullName] = useState("");
  const [creditNotifs, setCreditNotifs] = useState(true);
  const [jammingAlerts, setJammingAlerts] = useState(true);
  const [gpsFrozenAlerts, setGpsFrozenAlerts] = useState(true);
  const [gpsFrozenThreshold, setGpsFrozenThreshold] = useState(15);
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Sync state quand le profil est chargé
  const synced = useRef(false);
  useEffect(() => {
    if (profile && !synced.current) {
      setFullName(profile.fullName ?? "");
      setCreditNotifs(profile.creditNotificationsEnabled ?? true);
      setJammingAlerts(profile.jammingAlertsEnabled ?? true);
      setGpsFrozenAlerts(profile.gpsFrozenAlertsEnabled ?? true);
      setGpsFrozenThreshold(profile.gpsFrozenThresholdMin ?? 15);
      setLanguage(profile.preferredLanguage ?? "fr");
      synced.current = true;
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    const r = await updateProfile({
      fullName,
      creditNotificationsEnabled: creditNotifs,
      jammingAlertsEnabled: jammingAlerts,
      gpsFrozenAlertsEnabled: gpsFrozenAlerts,
      gpsFrozenThresholdMin: gpsFrozenThreshold,
      preferredLanguage: language,
    });
    setSaving(false);
    if (r.success) {
      setSaveMessage({ type: "success", text: "Profil mis à jour avec succès." });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ type: "error", text: r.error || "Erreur lors de la mise à jour." });
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("[signOut] erreur:", err);
      setSigningOut(false);
    }
  };

  if (!isReady) {
    return (
      <div className="grid h-full place-items-center px-4 py-12">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-yazz-warning" />
          <p className="font-outfit mt-3 text-[16px] font-bold text-yazz-text-dark">
            Supabase non configuré
          </p>
          <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
            Configurez les variables d'environnement pour accéder à votre profil.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !profile) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-yazz-primary" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="grid h-full place-items-center px-4 py-12">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-yazz-error" />
          <p className="font-outfit mt-3 text-[16px] font-bold text-yazz-text-dark">Erreur</p>
          <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="font-outfit mb-6 text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
          Paramètres
        </h1>

        {/* Profil */}
        <Section icon={UserIcon} title="Profil">
          <div className="space-y-3">
            <Field label="Nom complet">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Votre nom"
                className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Email" icon={Mail}>
                <input
                  type="email"
                  value={profile?.email ?? ""}
                  disabled
                  className="font-inter h-11 w-full cursor-not-allowed rounded-yazz-sm border border-yazz-border-light bg-yazz-background/50 px-3 pl-10 text-[13px] text-yazz-text-muted"
                />
              </Field>
              <Field label="Téléphone" icon={Phone}>
                <input
                  type="tel"
                  value={profile?.phone ?? ""}
                  disabled
                  className="font-inter h-11 w-full cursor-not-allowed rounded-yazz-sm border border-yazz-border-light bg-yazz-background/50 px-3 pl-10 text-[13px] text-yazz-text-muted"
                />
              </Field>
            </div>
            <p className="font-inter text-[10px] text-yazz-text-caption">
              L'email et le téléphone sont gérés par Supabase Auth. Contactez le support pour les modifier.
            </p>
          </div>
        </Section>

        {/* Préférences alertes */}
        <Section icon={Bell} title="Préférences d'alertes">
          <div className="space-y-1">
            <ToggleRow
              icon={Bell}
              label="Notifications de crédit"
              description="Recevoir une alerte quand le solde CDF est bas."
              value={creditNotifs}
              onChange={setCreditNotifs}
            />
            <ToggleRow
              icon={Radio}
              label="Alertes de brouillage GPS"
              description="Notification si le signal GPS est brouillé (jamming)."
              value={jammingAlerts}
              onChange={setJammingAlerts}
            />
            <ToggleRow
              icon={Snowflake}
              label="Alertes de GPS figé"
              description="Notification si la position GPS ne change plus."
              value={gpsFrozenAlerts}
              onChange={setGpsFrozenAlerts}
            />
            {gpsFrozenAlerts && (
              <div className="ml-11 mt-2 rounded-yazz-sm bg-yazz-background/60 p-3">
                <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
                  Seuil (minutes sans mouvement)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={gpsFrozenThreshold}
                  onChange={(e) => setGpsFrozenThreshold(parseInt(e.target.value, 10) || 15)}
                  className="font-inter h-10 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                />
              </div>
            )}
          </div>
        </Section>

        {/* Langue */}
        <Section icon={Languages} title="Langue">
          <div className="grid grid-cols-2 gap-2">
            {[
              { code: "fr", label: "Français", flag: "🇫🇷" },
              { code: "en", label: "English", flag: "🇬🇧" },
            ].map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={cn(
                  "font-inter flex items-center gap-2 rounded-yazz-sm border py-2.5 px-3 text-[12px] font-semibold transition-all",
                  language === l.code
                    ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary"
                    : "border-yazz-border-light bg-yazz-background text-yazz-text-body hover:border-yazz-border-medium"
                )}
              >
                <span className="text-[16px]">{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Save button */}
        {saveMessage && (
          <div
            className={cn(
              "mb-3 rounded-yazz-sm border-l-4 p-3",
              saveMessage.type === "success"
                ? "border-l-yazz-success bg-yazz-success/10"
                : "border-l-yazz-error bg-yazz-error/10"
            )}
          >
            <p className={cn("font-inter text-[12px]", saveMessage.type === "success" ? "text-yazz-success" : "text-yazz-error")}>
              {saveMessage.text}
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="font-inter mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary text-[13px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer les modifications
        </button>

        {/* Zone danger */}
        <Section icon={Shield} title="Compte" danger>
          <div className="space-y-2">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="font-inter flex w-full items-center justify-between rounded-yazz-sm bg-yazz-background p-3 text-left transition-colors hover:bg-yazz-accent"
            >
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5 text-yazz-text-body" />
                <div>
                  <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                    {signingOut ? "Déconnexion…" : "Déconnexion"}
                  </p>
                  <p className="font-inter text-[11px] text-yazz-text-muted">
                    Se déconnecter de votre compte YAZZ
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="font-inter flex w-full items-center justify-between rounded-yazz-sm bg-yazz-background p-3 text-left transition-colors hover:bg-yazz-error/10"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-yazz-error" />
                <div>
                  <p className="font-outfit text-[13px] font-semibold text-yazz-error">
                    Supprimer mon compte
                  </p>
                  <p className="font-inter text-[11px] text-yazz-text-muted">
                    Action irréversible — toutes vos données seront effacées
                  </p>
                </div>
              </div>
            </button>
          </div>
        </Section>
      </div>

      {/* Modal suppression compte */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg bg-yazz-error/10">
                <AlertTriangle className="h-5 w-5 text-yazz-error" />
              </div>
              <div>
                <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
                  Supprimer le compte ?
                </h2>
                <p className="font-inter text-[11px] text-yazz-text-muted">Action irréversible</p>
              </div>
            </div>

            <div className="rounded-yazz-sm border-l-4 border-l-yazz-error bg-yazz-error/5 p-3">
              <p className="font-inter text-[12px] leading-relaxed text-yazz-text-body">
                Cette action supprimera définitivement votre compte, vos véhicules liés, votre historique de trajets, vos géofences, et votre solde de crédit. <strong>Vous ne pourrez pas annuler cette action.</strong>
              </p>
            </div>

            <p className="font-inter mt-3 text-[12px] text-yazz-text-muted">
              Pour confirmer, contactez le support YAZZ qui procédera à la suppression via une procédure sécurisée.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent"
              >
                Annuler
              </button>
              <a
                href="https://wa.me/243986842924?text=Bonjour%2C%20je%20souhaite%20supprimer%20mon%20compte%20YAZZ"
                target="_blank"
                rel="noopener noreferrer"
                className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-error/90 active:scale-95"
              >
                Contacter le support
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Composants UI
// ============================================================

function Section({
  icon: Icon,
  title,
  children,
  danger,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={cn("mb-4 rounded-yazz-xl border bg-yazz-surface p-4 yazz-shadow-soft", danger ? "border-yazz-error/20" : "border-yazz-border-light")}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className={cn("h-4 w-4", danger ? "text-yazz-error" : "text-yazz-primary")} />
        <h2 className="font-outfit text-[14px] font-bold tracking-[-0.01em] text-yazz-text-dark">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: any;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yazz-text-caption" />
        )}
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: any;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-yazz-sm p-2 hover:bg-yazz-background/40">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-yazz-lg bg-yazz-accent text-yazz-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">{label}</p>
          <p className="font-inter text-[11px] text-yazz-text-muted">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          value ? "bg-yazz-primary" : "bg-yazz-border-medium"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-yazz-soft transition-transform",
            value ? "translate-x-[21px]" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}
