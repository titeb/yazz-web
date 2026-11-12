"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import { YazzLogo } from "@/components/yazz/yazz-logo";
import { cn } from "@/lib/utils";
import { captureOwnerKeyFromUrl, ownerLoginKey, waitOwnerCode } from "@/lib/owner-login";
import {
  Mail,
  Phone,
  ArrowRight,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type Mode = "phone" | "email";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-yazz-background">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-yazz-border-light border-t-yazz-primary" />
        <p className="font-inter text-[13px] font-medium text-yazz-text-muted">
          Chargement…
        </p>
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const supabase = createClientSafe();
  const supabaseReady = isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"input" | "otp">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connexion de test sans SMS (lien donné par yazz-admin, ouvert une fois
  // dans ce navigateur) : le code est récupéré et rempli tout seul.
  const autoRun = useRef(0);
  useEffect(() => {
    captureOwnerKeyFromUrl();
    return () => {
      autoRun.current++;
    };
  }, []);

  const formatPhone = (raw: string) => {
    // Normaliser le phone RDC : +243XXXXXXXXX
    let p = raw.replace(/\s+/g, "");
    if (p.startsWith("0")) p = "+243" + p.slice(1);
    if (!p.startsWith("+")) p = "+" + p;
    return p;
  };

  const sendOtp = async () => {
    setError(null);
    if (!supabaseReady) {
      setError("Supabase n'est pas configuré. Remplis .env.local avec tes credentials.");
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = formatPhone(phone);
      const { error } = await supabase!.auth.signInWithOtp({
        phone: formattedPhone,
      });
      if (error) throw error;
      setStep("otp");
      const key = ownerLoginKey();
      if (key) void autoFill(formattedPhone, key);
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi du code OTP");
    } finally {
      setLoading(false);
    }
  };

  // Sync localStorage session to cookies for middleware (SSR)
  const syncSessionToCookies = async () => {
    // @supabase/supabase-js stores in localStorage, but middleware reads cookies.
    // We need to manually set the cookie that @supabase/ssr expects.
    const storageKey = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`;
    const token = localStorage.getItem(storageKey);
    if (token) {
      // Set cookie for middleware to read
      document.cookie = `${storageKey}=${encodeURIComponent(token)}; path=/; max-age=3600; SameSite=Lax`;
    }
  };

  const autoFill = async (formattedPhone: string, key: string) => {
    const run = ++autoRun.current;
    const code = await waitOwnerCode(formattedPhone, key, { cancelled: () => autoRun.current !== run });
    if (!code || autoRun.current !== run) return;
    setOtp(code);
    await verifyOtp(code);
  };

  const verifyOtp = async (code: string = otp) => {
    setError(null);
    if (!supabaseReady) {
      setError("Supabase n'est pas configuré.");
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = formatPhone(phone);
      const { error } = await supabase!.auth.verifyOtp({
        phone: formattedPhone,
        token: code,
        type: "sms",
      });
      if (error) throw error;
      // Sync session to cookies for middleware
      await syncSessionToCookies();
      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Code OTP invalide");
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async () => {
    setError(null);
    if (!supabaseReady) {
      setError("Supabase n'est pas configuré.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase!.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Sync session to cookies for middleware
      await syncSessionToCookies();
      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Connexion échouée");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Brand panel (gauche, desktop) */}
      <div className="relative hidden overflow-hidden yazz-gradient-primary lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-20">
          <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <pattern id="grid-login" width="6" height="6" patternUnits="userSpaceOnUse">
                <path d="M 6 0 L 0 0 0 6" fill="none" stroke="white" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid-login)" />
          </svg>
        </div>

        <div className="yazz-stagger relative flex flex-col items-center text-center">
          {/* Logo agrandi */}
          <YazzLogo variant="mark" size={120} />

          {/* Slogan */}
          <h1 className="font-outfit mt-8 text-5xl font-bold leading-tight tracking-[-0.03em] text-white">
            Sécurisez vos véhicules,
            <br />
            <span className="text-white/80">où que vous soyez.</span>
          </h1>
        </div>
      </div>

      {/* Form panel (droite) */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="yazz-stagger w-full max-w-md">
          {/* Logo mobile */}
          <div className="mb-8 flex justify-center lg:hidden">
            <YazzLogo />
          </div>

          <div className="mb-8">
            <h2 className="font-outfit text-[28px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Bienvenue
            </h2>
            <p className="font-inter mt-1 text-[14px] text-yazz-text-muted">
              Connectez-vous pour accéder à votre tableau de bord
            </p>
          </div>

          {/* Toggle phone/email */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-yazz-sm bg-yazz-accent p-1">
            <button
              onClick={() => {
                autoRun.current++;
                setMode("phone");
                setStep("input");
                setError(null);
              }}
              className={cn(
                "font-inter flex items-center justify-center gap-1.5 rounded-yazz-xs py-2 text-[12px] font-semibold transition-all",
                mode === "phone"
                  ? "bg-yazz-surface text-yazz-primary shadow-yazz-soft"
                  : "text-yazz-text-muted hover:text-yazz-text-body"
              )}
            >
              <Phone className="h-3.5 w-3.5" />
              Téléphone
            </button>
            <button
              onClick={() => {
                autoRun.current++;
                setMode("email");
                setStep("input");
                setError(null);
              }}
              className={cn(
                "font-inter flex items-center justify-center gap-1.5 rounded-yazz-xs py-2 text-[12px] font-semibold transition-all",
                mode === "email"
                  ? "bg-yazz-surface text-yazz-primary shadow-yazz-soft"
                  : "text-yazz-text-muted hover:text-yazz-text-body"
              )}
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
          </div>

          {/* Mode téléphone */}
          {mode === "phone" && (
            <div className="space-y-4">
              {step === "input" ? (
                <>
                  <div>
                    <label className="font-inter mb-1.5 block text-[12px] font-medium text-yazz-text-body">
                      Numéro de téléphone
                    </label>
                    <input
                      type="tel"
                      placeholder="+243 8XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="font-inter h-12 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-4 text-[14px] text-yazz-text-dark transition-all placeholder:text-yazz-text-caption focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                    />
                    <p className="font-inter mt-1.5 text-[11px] text-yazz-text-caption">
                      Vous recevrez un code OTP par SMS
                    </p>
                  </div>

                  <button
                    onClick={sendOtp}
                    disabled={!phone || loading}
                    className="font-inter flex h-12 w-full items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary text-[14px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Envoyer le code
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      autoRun.current++;
                      setStep("input");
                      setOtp("");
                      setError(null);
                    }}
                    className="font-inter flex items-center gap-1 text-[12px] font-medium text-yazz-text-muted hover:text-yazz-primary"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Modifier le numéro
                  </button>

                  <div>
                    <label className="font-inter mb-1.5 block text-[12px] font-medium text-yazz-text-body">
                      Code OTP
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="123456"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="font-outfit h-14 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-4 text-center text-[24px] font-bold tracking-[0.4em] text-yazz-text-dark transition-all placeholder:text-yazz-text-caption focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                    />
                    <p className="font-inter mt-1.5 text-[11px] text-yazz-text-caption">
                      {`Code envoyé au ${formatPhone(phone)}`}
                    </p>
                  </div>

                  <button
                    onClick={() => verifyOtp()}
                    disabled={otp.length < 6 || loading}
                    className="font-inter flex h-12 w-full items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary text-[14px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Vérifier le code
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Mode email */}
          {mode === "email" && (
            <div className="space-y-4">
              <div>
                <label className="font-inter mb-1.5 block text-[12px] font-medium text-yazz-text-body">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-inter h-12 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-4 text-[14px] text-yazz-text-dark transition-all placeholder:text-yazz-text-caption focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                />
              </div>

              <div>
                <label className="font-inter mb-1.5 block text-[12px] font-medium text-yazz-text-body">
                  Mot de passe
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && signInWithEmail()}
                  className="font-inter h-12 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-4 text-[14px] text-yazz-text-dark transition-all placeholder:text-yazz-text-caption focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                />
              </div>

              <button
                onClick={signInWithEmail}
                disabled={(!email || !password) || loading}
                className="font-inter flex h-12 w-full items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary text-[14px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Se connecter
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="mt-4 rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/5 p-3">
              <p className="font-inter text-[12px] font-medium text-yazz-error">
                {error}
              </p>
            </div>
          )}

          {/* Footer */}
          <p className="font-inter mt-8 text-center text-[11px] text-yazz-text-caption">
            En vous connectant, vous acceptez nos conditions d'utilisation
            <br />
            et notre politique de confidentialité.
          </p>
        </div>
      </div>
    </div>
  );
}
