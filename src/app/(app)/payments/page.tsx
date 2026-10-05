"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserStats } from "@/hooks/use-user-stats";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentStatus = "PENDING" | "SUBMITTED" | "SUCCESS" | "FAILED" | "CANCELLED";

type Operator = {
  id: string;
  label: string;
  color: string;
  bg: string;
  prefixes: string[]; // 2 digits après +243
};

// Mapping préfixes RDC → opérateur Mobile Money
// 81, 82, 84 → Airtel Money (Shwary)
// 80, 89     → Orange Money (PawaPay)
// 97, 98, 99 → Vodacom M-Pesa (Shwary)
const OPERATORS: Operator[] = [
  { id: "airtel",  label: "Airtel Money",  color: "text-yazz-error",  bg: "bg-yazz-error/10",  prefixes: ["81", "82", "84"] },
  { id: "orange",  label: "Orange Money",  color: "text-yazz-orange", bg: "bg-yazz-orange/10", prefixes: ["80", "89"] },
  { id: "mpesa",   label: "M-Pesa",        color: "text-yazz-success", bg: "bg-yazz-success/10", prefixes: ["97", "98", "99"] },
];

// Détecte l'opérateur depuis le numéro +243XXXXXXXXX
function detectOperator(phone: string): Operator | null {
  const digits = phone.replace(/\D/g, "");
  // Accepte +243XXXXXXXXX ou 0XXXXXXXXX
  const after243 = digits.startsWith("243") ? digits.slice(3) : (digits.startsWith("0") ? digits.slice(1) : digits);
  if (after243.length < 2) return null;
  const prefix = after243.slice(0, 2);
  return OPERATORS.find((op) => op.prefixes.includes(prefix)) ?? null;
}

// Traduit un message d'erreur backend/Shwary en message clair pour l'utilisateur.
// On se base sur les messages réels observés dans la DB (failure_reason).
function friendlyErrorMessage(rawMessage: string): string {
  const msg = (rawMessage || "").toLowerCase();
  // Service indisponible (transient — réessayer plus tard)
  if (
    msg.includes("temporarily unavailable") ||
    msg.includes("merchant api") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("backend unreachable")
  ) {
    return "Service Mobile Money temporairement indisponible. Réessayez dans quelques instants.";
  }
  // Solde insuffisant sur le compte Mobile Money du client
  if (msg.includes("not enough funds") || msg.includes("insufficient funds") || msg.includes("solde insuffisant")) {
    return "Solde Mobile Money insuffisant. Vérifiez le solde de votre compte et réessayez.";
  }
  // Numéro invalide côté opérateur
  if (msg.includes("invalid phone") || msg.includes("numero invalide") || msg.includes("invalid msisdn")) {
    return "Numéro Mobile Money invalide. Vérifiez le numéro saisi.";
  }
  // Opérateur injoignable / client a refusé
  if (msg.includes("did not specify a reason") || msg.includes("customer rejected") || msg.includes("cancelled by user")) {
    return "La transaction a été refusée ou annulée par l'opérateur. Réessayez ou contactez votre opérateur.";
  }
  // Passerelle non configurée
  if (msg.includes("passerelle de paiement non configure") || msg.includes("not configured")) {
    return "Paiement indisponible pour le moment. Contactez le support YAZZ.";
  }
  // Montant minimum
  if (msg.includes("montant minimum") || msg.includes("minimum")) {
    return rawMessage; // déjà en français, clair
  }
  // Par défaut : retourner le message brut (souvent déjà explicite)
  return rawMessage || "Erreur lors du paiement. Réessayez.";
}

type Payment = {
  id: string;
  amount: number;
  currency: string;
  provider: string | null;
  status: PaymentStatus;
  phone: string | null;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
};

const PRESET_AMOUNTS = [3000, 5000, 10000, 20000, 50000];

const statusConfig: Record<PaymentStatus, { label: string; color: string; bg: string; icon: any }> = {
  PENDING: { label: "En attente", color: "text-yazz-warning", bg: "bg-yazz-warning/10", icon: Clock },
  SUBMITTED: { label: "En cours", color: "text-yazz-info", bg: "bg-yazz-info/10", icon: Loader2 },
  SUCCESS: { label: "Réussi", color: "text-yazz-success", bg: "bg-yazz-success/10", icon: CheckCircle2 },
  FAILED: { label: "Échoué", color: "text-yazz-error", bg: "bg-yazz-error/10", icon: AlertTriangle },
  CANCELLED: { label: "Annulé", color: "text-yazz-text-muted", bg: "bg-yazz-accent", icon: AlertTriangle },
};

export default function PaymentsPage() {
  const isReady = isSupabaseConfigured();
  const { stats, refetch: refetchStats } = useUserStats();

  const [amount, setAmount] = useState<number>(5000);
  const [customAmount, setCustomAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{ id: string; checkoutUrl?: string | null } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Détection automatique de l'opérateur (pas de bouton radio — on lit le préfixe)
  const detectedOperator = detectOperator(phone);

  // Fetch historique paiements
  const fetchPayments = useCallback(async () => {
    if (!isReady) return;
    setPaymentsLoading(true);
    try {
      const res = await fetch("/api/payments/history?limit=20");
      if (res.ok) {
        const data = await res.json();
        // Format peut varier selon le backend : soit array direct, soit { payments: [...] }
        const arr = Array.isArray(data) ? data : (data?.payments ?? data?.data ?? []);
        setPayments(arr);
      } else {
        console.warn("[payments] history erreur:", res.status);
      }
    } catch (err) {
      console.error("[payments] history fetch erreur:", err);
    } finally {
      setPaymentsLoading(false);
    }
  }, [isReady]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Polling status si paiement en cours
  useEffect(() => {
    if (!pendingPayment) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${pendingPayment.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        const status = data?.status as PaymentStatus | undefined;
        if (status === "SUCCESS" || status === "FAILED" || status === "CANCELLED") {
          clearInterval(interval);
          setPendingPayment(null);
          refetchStats();
          fetchPayments();
        }
      } catch (err) {
        console.error("[payments] polling erreur:", err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingPayment, refetchStats, fetchPayments]);

  const formatPhone = (raw: string) => {
    let p = raw.replace(/\s+/g, "");
    if (p.startsWith("0")) p = "+243" + p.slice(1);
    if (!p.startsWith("+")) p = "+" + p;
    return p;
  };

  const handleSubmit = async () => {
    setError(null);
    const finalAmount = customAmount ? parseInt(customAmount, 10) : amount;
    if (!finalAmount || finalAmount < 3000) {
      setError("Le montant minimum est de 3 000 CDF.");
      return;
    }
    if (!phone) {
      setError("Le numéro de téléphone est requis pour le paiement Mobile Money.");
      return;
    }
    if (!/^\+243\d{9}$/.test(formatPhone(phone))) {
      setError("Numéro invalide. Format attendu : +243XXXXXXXXX (9 chiffres après +243).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatPhone(phone),
          amount: finalAmount,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Erreur ${res.status}`);
      }

      // Le backend retourne payment_id (snake_case), pas paymentId
      const paymentId = data?.payment_id || data?.paymentId || data?.id;
      const checkoutUrl = data?.checkoutUrl;

      if (checkoutUrl) {
        // Ouvrir l'URL de paiement dans un nouvel onglet
        window.open(checkoutUrl, "_blank");
      }

      if (paymentId) {
        setPendingPayment({ id: paymentId, checkoutUrl });
      } else {
        // Pas d'ID — refresh de toute façon
        fetchPayments();
      }
    } catch (err: any) {
      setError(friendlyErrorMessage(err.message || "Erreur lors de l'initiation du paiement."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
            Paiements
          </h1>
          <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
            Rechargez votre crédit YAZZ en CDF via Mobile Money.
          </p>
        </div>

        {/* Solde */}
        <div className="mb-6 rounded-yazz-xl yazz-gradient-primary p-5 text-white yazz-shadow-medium">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-inter text-[11px] uppercase tracking-wide text-white/70">
                Solde actuel
              </p>
              <p className="font-outfit mt-1 text-[36px] font-bold tracking-[-0.02em]">
                {stats.creditBalance.toLocaleString("fr-FR")}{" "}
                <span className="text-[16px] font-semibold text-white/80">{stats.creditCurrency}</span>
              </p>
              <p className="font-inter mt-1 text-[11px] text-white/70">
                {stats.creditIsActive
                  ? stats.daysUntilExpiry !== null
                    ? `Expire dans ${stats.daysUntilExpiry} jour${stats.daysUntilExpiry > 1 ? "s" : ""}`
                    : "Actif"
                  : "⚠ Crédit inactif — rechargez pour réactiver le suivi"}
              </p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-yazz-lg bg-white/15">
              <Wallet className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Recharge form */}
        <div className="mb-6 rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-5 yazz-shadow-soft">
          <h2 className="font-outfit mb-4 text-[15px] font-bold tracking-[-0.01em] text-yazz-text-dark">
            Recharger
          </h2>

          {/* Montant preset */}
          <div className="mb-4">
            <label className="font-inter mb-2 block text-[11px] font-medium text-yazz-text-body">
              Montant
            </label>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setAmount(amt);
                    setCustomAmount("");
                  }}
                  className={cn(
                    "font-outfit rounded-yazz-sm border py-2.5 text-[13px] font-bold transition-all",
                    !customAmount && amount === amt
                      ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary"
                      : "border-yazz-border-light bg-yazz-background text-yazz-text-body hover:border-yazz-border-medium"
                  )}
                >
                  {amt.toLocaleString("fr-FR")}
                </button>
              ))}
            </div>
          </div>

          {/* Montant custom */}
          <div className="mb-4">
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
              Ou montant personnalisé (min. 3 000 CDF)
            </label>
            <input
              type="number"
              placeholder="ex: 15000"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              min={3000}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[14px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </div>

          {/* Téléphone + détection opérateur */}
          <div className="mb-4">
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
              Numéro Mobile Money
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yazz-text-caption" />
              <input
                type="tel"
                placeholder="+243 8XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={cn(
                  "font-inter h-11 w-full rounded-yazz-sm border bg-yazz-background pl-10 pr-3 text-[14px] text-yazz-text-dark focus:outline-none focus:ring-2",
                  detectedOperator
                    ? "border-yazz-primary/30 focus:border-yazz-primary focus:ring-yazz-primary/20"
                    : "border-yazz-border-light focus:border-yazz-primary focus:ring-yazz-primary/20"
                )}
              />
            </div>
            {/* Badge opérateur détecté */}
            {detectedOperator && (
              <div className="mt-2 flex items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold", detectedOperator.bg, detectedOperator.color)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", detectedOperator.color.replace("text-", "bg-"))} />
                  {detectedOperator.label}
                </span>
                <span className="font-inter text-[10px] text-yazz-text-caption">
                  opérateur détecté automatiquement
                </span>
              </div>
            )}
            {phone && !detectedOperator && phone.replace(/\D/g, "").length >= 5 && (
              <p className="font-inter mt-2 text-[10px] text-yazz-warning">
                Préfixe non reconnu. Utilisez un numéro Airtel (81/82/84), Orange (80/89) ou Vodacom (97/98/99).
              </p>
            )}
          </div>

          {/* Erreur */}
          {error && (
            <div className="mb-3 rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2.5">
              <p className="font-inter text-[11px] text-yazz-error">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !!pendingPayment}
            className="font-inter flex h-11 w-full items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary text-[13px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowDownCircle className="h-4 w-4" />
                Recharger {((customAmount ? parseInt(customAmount, 10) : amount) || 0).toLocaleString("fr-FR")} CDF
              </>
            )}
          </button>
        </div>

        {/* Paiement en cours */}
        {pendingPayment && (
          <div className="mb-6 rounded-yazz-xl border border-yazz-info/30 bg-yazz-info/5 p-4 yazz-shadow-soft">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-yazz-info" />
              <div className="flex-1">
                <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                  Paiement en cours
                </p>
                <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                  Surveillez votre téléphone pour valider la transaction Mobile Money.
                  Cette page se mettra à jour automatiquement.
                </p>
                {pendingPayment.checkoutUrl && (
                  <a
                    href={pendingPayment.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-inter mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-yazz-info hover:underline"
                  >
                    Ouvrir la page de paiement
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Historique */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Historique des transactions
            </h2>
            <button
              onClick={fetchPayments}
              className="font-inter grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
              title="Rafraîchir"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {payments.length === 0 && (
            <div className="grid place-items-center py-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-yazz-accent">
                <Wallet className="h-5 w-5 text-yazz-text-muted" />
              </div>
              <p className="font-outfit mt-2 text-[14px] font-semibold text-yazz-text-dark">
                Aucune transaction
              </p>
              <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                Vos recharges apparaîtront ici.
              </p>
            </div>
          )}

          {payments.length > 0 && (
            <ul className="space-y-2">
              {payments.map((p) => {
                const cfg = statusConfig[p.status] || statusConfig.PENDING;
                const Icon = cfg.icon;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-yazz-md border border-yazz-border-light bg-yazz-surface p-3 yazz-shadow-soft"
                  >
                    <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg", cfg.bg)}>
                      <Icon className={cn("h-5 w-5", cfg.color, p.status === "SUBMITTED" && "animate-spin")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                          {p.amount.toLocaleString("fr-FR")} {p.currency}
                        </p>
                        <span className={cn("font-inter rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="font-inter mt-0.5 flex items-center gap-2 text-[10px] text-yazz-text-caption">
                        <span className="uppercase">{p.provider}</span>
                        <span>·</span>
                        <span>{new Date(p.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        {p.phone && (
                          <>
                            <span>·</span>
                            <span>{p.phone}</span>
                          </>
                        )}
                      </div>
                      {p.failureReason && (
                        <p className="font-inter mt-1 text-[10px] text-yazz-error">
                          {p.failureReason}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
