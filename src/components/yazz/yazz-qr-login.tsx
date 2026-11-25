"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Smartphone, XCircle } from "lucide-react";
import { BACKEND_URL } from "@/lib/backend";
import { createClientSafe } from "@/lib/supabase/client";

/**
 * Connexion par QR code (comme WhatsApp Web).
 *
 * Le serveur YAZZ crée une demande et dessine le QR code (« YAZZ-WEB:… »).
 * Le client le scanne avec l'app (Paramètres → Connecter YAZZ Web) et
 * confirme. Cette page, qui interroge le serveur avec son secret (jamais dans
 * le QR code), reçoit alors de quoi ouvrir la session Supabase :
 *   - compte e-mail : un jeton à usage unique ;
 *   - compte téléphone : le numéro ; on demande un code à Supabase, que le
 *     serveur remet à cette page au lieu de l'envoyer par SMS.
 */
type Phase = "loading" | "pending" | "scanned" | "connecting" | "denied" | "expired" | "error";

type PollResult = {
  status: string;
  method?: "email" | "phone";
  token_hash?: string;
  phone?: string;
  code?: string | null;
};

const POLL_MS = 2500;
const MAX_AUTO_REFRESH = 5;

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function YazzQrLogin({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const supabase = createClientSafe();
  const [phase, setPhase] = useState<Phase>("loading");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ id: string; secret: string } | null>(null);
  const otpRequested = useRef(false);
  const busy = useRef(false);
  const autoRefreshes = useRef(0);
  const done = useRef(false);

  // Nouvelle demande au serveur (sans toucher à l'affichage)
  const requestNew = useCallback(async (): Promise<{ id: string; secret: string; svg: string } | { error: string }> => {
    otpRequested.current = false;
    try {
      const { ok, data } = await postJson("/api/web-login/start", {});
      if (!ok || !data?.id || !data?.qr_svg) return { error: data?.error || "Serveur YAZZ indisponible" };
      return { id: data.id, secret: data.poll_secret, svg: data.qr_svg };
    } catch {
      return { error: "Serveur YAZZ injoignable" };
    }
  }, []);

  const apply = useCallback((r: { id: string; secret: string; svg: string } | { error: string }) => {
    if ("error" in r) {
      request.current = null;
      setError(r.error);
      setPhase("error");
      return;
    }
    request.current = { id: r.id, secret: r.secret };
    setSvg(r.svg);
    setError(null);
    setPhase("pending");
  }, []);

  const start = useCallback(() => {
    setPhase("loading");
    setError(null);
    void requestNew().then(apply);
  }, [requestNew, apply]);

  useEffect(() => {
    let alive = true;
    void requestNew().then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [requestNew, apply]);

  const finish = useCallback(
    async (r: PollResult) => {
      if (!supabase) throw new Error("Connexion indisponible");
      if (r.method === "email" && r.token_hash) {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
        if (err) throw err;
        done.current = true;
        await onSignedIn();
        return;
      }
      if (r.method === "phone" && r.phone) {
        if (r.code) {
          const { error: err } = await supabase.auth.verifyOtp({ phone: r.phone, token: r.code, type: "sms" });
          if (err) throw err;
          done.current = true;
          await onSignedIn();
        } else if (!otpRequested.current) {
          // Le code ne part pas par SMS : le serveur le remet à cette page
          otpRequested.current = true;
          const { error: err } = await supabase.auth.signInWithOtp({ phone: r.phone, options: { shouldCreateUser: false } });
          if (err) throw err;
        }
      }
    },
    [supabase, onSignedIn]
  );

  useEffect(() => {
    if (!["pending", "scanned", "connecting"].includes(phase)) return;
    const timer = setInterval(async () => {
      const req = request.current;
      if (busy.current || done.current || !req || document.hidden) return;
      busy.current = true;
      try {
        const { status, data } = await postJson("/api/web-login/poll", { id: req.id, poll_secret: req.secret });
        if (status === 404) {
          // Demande inconnue (serveur redémarré) : nouveau QR code
          if (phase !== "connecting") void start();
          return;
        }
        const r = data as PollResult;
        if (r.status === "scanned") setPhase("scanned");
        else if (r.status === "denied") setPhase("denied");
        else if (r.status === "expired") {
          if (autoRefreshes.current < MAX_AUTO_REFRESH) {
            autoRefreshes.current += 1;
            void start();
          } else setPhase("expired");
        } else if (r.status === "approved") {
          setPhase("connecting");
          await finish(r);
        }
      } catch (e: any) {
        setError(e?.message || "La connexion a échoué. Réessayez.");
        setPhase("error");
      } finally {
        busy.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, start, finish]);

  const restart = () => {
    autoRefreshes.current = 0;
    void start();
  };

  return (
    <div className="space-y-5">
      <div className="mx-auto w-fit rounded-2xl border border-yazz-border-light bg-white p-3 shadow-yazz-soft">
        <div className="relative grid h-[232px] w-[232px] place-items-center">
          {svg && phase !== "loading" && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              alt="QR code de connexion à YAZZ Web"
              className={phase === "pending" ? "h-full w-full" : "h-full w-full opacity-15 blur-[2px]"}
            />
          )}
          {phase === "loading" && <Loader2 className="h-7 w-7 animate-spin text-yazz-primary" />}
          {phase === "scanned" && (
            <Overlay icon={<Smartphone className="h-7 w-7 text-yazz-primary" />} text="Confirmez sur votre téléphone" />
          )}
          {phase === "connecting" && (
            <Overlay icon={<CheckCircle2 className="h-7 w-7 text-yazz-success" />} text="Connexion en cours…" spinner />
          )}
          {phase === "denied" && (
            <Overlay
              icon={<XCircle className="h-7 w-7 text-yazz-error" />}
              text="Connexion refusée sur le téléphone"
              action={{ label: "Nouveau QR code", onClick: restart }}
            />
          )}
          {(phase === "expired" || phase === "error") && (
            <Overlay
              icon={<RefreshCw className="h-7 w-7 text-yazz-text-muted" />}
              text={phase === "expired" ? "QR code expiré" : error || "Erreur"}
              action={{ label: "Recharger le QR code", onClick: restart }}
            />
          )}
        </div>
      </div>

      <ol className="font-inter space-y-2 text-[13px] text-yazz-text-body">
        <Step n={1}>Ouvrez l&apos;app <b>YAZZ</b> sur votre téléphone</Step>
        <Step n={2}>
          Allez dans <b>Paramètres</b> → <b>Connecter YAZZ Web</b>
        </Step>
        <Step n={3}>Pointez votre téléphone vers ce QR code, puis confirmez</Step>
      </ol>
      <p className="font-inter text-[11px] text-yazz-text-caption">
        Ce QR code sert uniquement à ouvrir YAZZ Web : ce n&apos;est pas celui d&apos;un capteur ni d&apos;une montre. Il change toutes les 2 minutes.
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="font-outfit grid h-5 w-5 shrink-0 place-items-center rounded-full bg-yazz-primary/10 text-[11px] font-bold text-yazz-primary">
        {n}
      </span>
      <span className="pt-px">{children}</span>
    </li>
  );
}

function Overlay({
  icon,
  text,
  spinner,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  spinner?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
      {icon}
      <p className="font-inter text-[13px] font-semibold text-yazz-text-dark">{text}</p>
      {spinner && <Loader2 className="h-4 w-4 animate-spin text-yazz-primary" />}
      {action && (
        <button
          onClick={action.onClick}
          className="font-inter mt-1 rounded-yazz-sm bg-yazz-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-yazz-primary/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
