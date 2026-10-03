"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import { YazzLogo } from "@/components/yazz/yazz-logo";
import { cn } from "@/lib/utils";
import {
  Mail,
  Phone,
  ArrowRight,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

type Mode = "phone" | "email";

// ═══════════════════════════════════════════════════════════════
// TEST ACCOUNTS — OTP auto-fetch (reproduction exacte du Flutter)
// ═══════════════════════════════════════════════════════════════
// Ces 13 numéros sont des comptes test. Quand un testeur demande un OTP,
// le backend stocke le code en mémoire au lieu d'envoyer un SMS.
// L'app récupère automatiquement le code via /api/auth/test-code
// et l'auto-saisit pour l'utilisateur.
// ⚠️ TEMPORAIRE — à retirer après tests (cf. audit P0-2)
const TEST_PHONES = new Set<string>([
  "243810000001", "243810000002", "243810000003", "243810000004",
  "243810000005", "243810000006", "243810000007", "243810000008",
  "243810000009", "243810000010", "243810000011", "243810000012",
  "243986842924", // Henock Titebe (owner)
]);
const TEST_CODE_KEY = "yazz-test-2026";
const BACKEND_URL = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
// ═══════════════════════════════════════════════════════════════

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

  // ─── TEST ACCOUNTS state ───────────────────────────────
  const [testOtpCode, setTestOtpCode] = useState<string | null>(null);
  const [isFetchingTestCode, setIsFetchingTestCode] = useState(false);
  const [testFetchAttempts, setTestFetchAttempts] = useState(0);
  const [isTestPhone, setIsTestPhone] = useState(false);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ──────────────────────────────────────────────────────

  const formatPhone = (raw: string) => {
    // Normaliser le phone RDC : +243XXXXXXXXX
    let p = raw.replace(/\s+/g, "");
    if (p.startsWith("0")) p = "+243" + p.slice(1);
    if (!p.startsWith("+")) p = "+" + p;
    return p;
  };

  // Vérifie si le phone est un numéro test
  const checkIsTestPhone = (raw: string): boolean => {
    const digits = raw.replace(/\D/g, "");
    return TEST_PHONES.has(digits);
  };

  // Pour les numéros test, Supabase est configuré avec sms_test_otp
  // → le code est toujours "123456" (pas besoin de fetch depuis le backend)
  const fetchTestOtpCode = async (phoneDigits: string) => {
    if (isFetchingTestCode || testOtpCode) return;
    setIsFetchingTestCode(true);
    try {
      // Supabase test OTP = toujours "123456" pour les numéros test
      const code = "123456";
      setTestOtpCode(code);
      setOtp(code);
      // Auto-valider après 500ms
      setTimeout(() => {
        if (code.length === 6) verifyOtpWithCode(code, phoneDigits);
      }, 500);
    } catch {
      setIsFetchingTestCode(false);
    }
  };

  // Cleanup du timer quand on quitte la page
  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, []);

  const sendOtp = async () => {
    setError(null);
    if (!supabaseReady) {
      setError("Supabase n'est pas configuré. Remplis .env.local avec tes credentials.");
      return;
    }
    setLoading(true);
    // Reset test OTP state
    setTestOtpCode(null);
    setTestFetchAttempts(0);
    try {
      const formattedPhone = formatPhone(phone);
      const phoneDigits = formattedPhone.replace(/\D/g, "");
      const isTest = TEST_PHONES.has(phoneDigits);
      setIsTestPhone(isTest);

      const { error } = await supabase!.auth.signInWithOtp({
        phone: formattedPhone,
      });
      if (error) throw error;
      setStep("otp");

      // TEST ACCOUNTS : auto-fetch le code après 3s (comme le Flutter)
      if (isTest) {
        fetchTimerRef.current = setTimeout(() => fetchTestOtpCode(phoneDigits), 3000);
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi du code OTP");
    } finally {
      setLoading(false);
    }
  };

  // Verify avec code fourni explicitement (pour auto-validation test)
  const verifyOtpWithCode = async (code: string, phoneDigitsParam?: string) => {
    setError(null);
    if (!supabaseReady) return;
    setLoading(true);
    try {
      const formattedPhone = formatPhone(phone);
      const { error } = await supabase!.auth.verifyOtp({
        phone: formattedPhone,
        token: code,
        type: "sms",
      });
      if (error) throw error;
      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Code OTP invalide");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
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
        token: otp,
        type: "sms",
      });
      if (error) throw error;
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

        <div className="relative flex flex-col items-center text-center">
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
        <div className="w-full max-w-md">
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
                      setStep("input");
                      setOtp("");
                      setError(null);
                      setTestOtpCode(null);
                      setTestFetchAttempts(0);
                      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
                    }}
                    className="font-inter flex items-center gap-1 text-[12px] font-medium text-yazz-text-muted hover:text-yazz-primary"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Modifier le numéro
                  </button>

                  {/* Bannière Mode Test (comme le Flutter) */}
                  {isTestPhone && (
                    <div className={cn(
                      "rounded-yazz-sm border-l-2 p-3 yazz-animate-fade-in-up",
                      testOtpCode
                        ? "border-l-yazz-success bg-yazz-success/10"
                        : "border-l-yazz-info bg-yazz-info/10"
                    )}>
                      <div className="flex items-start gap-2.5">
                        {testOtpCode ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-yazz-success" />
                        ) : isFetchingTestCode ? (
                          <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin text-yazz-info" />
                        ) : (
                          <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-yazz-info" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-outfit text-[12px] font-bold text-yazz-text-dark">
                            {testOtpCode ? "Code OTP test récupéré" : "Mode test (sans SMS)"}
                          </p>
                          <p className="font-inter mt-0.5 text-[11px] text-yazz-text-muted leading-relaxed">
                            {testOtpCode ? (
                              <>
                                Code <span className="font-mono font-bold text-yazz-success">{testOtpCode}</span> appliqué. Validation automatique…
                              </>
                            ) : isFetchingTestCode ? (
                              <>Récupération du code en cours…</>
                            ) : testFetchAttempts >= 5 ? (
                              <>Impossible de récupérer le code. Saisis-le manuellement si tu l'as reçu par ailleurs.</>
                            ) : (
                              <>Backend stocke le code en mémoire. Récupération dans 3s…</>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                      {isTestPhone
                        ? "Code test — pas de SMS envoyé (économise les crédits)"
                        : `Code envoyé au ${formatPhone(phone)}`}
                    </p>
                  </div>

                  <button
                    onClick={verifyOtp}
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
