"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserVehicles } from "@/hooks/use-user-vehicles";
import { isSupabaseConfigured, createClientSafe } from "@/lib/supabase/client";
import {
  Share2,
  Plus,
  Loader2,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Eye,
  Bell,
  UserPlus,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SharedDevice = {
  id: string;
  deviceId: string;
  ownerId: string;
  sharedWithId: string | null;
  permission: string;
  createdAt: string;
  expiresAt: string | null;
  isExpired: boolean | null;
  shareToken: string | null;
  // joined
  deviceName?: string;
  sharedWithName?: string | null;
};

type ShareInvitation = {
  id: string;
  sharedDeviceId: string;
  inviterId: string;
  inviteeId: string;
  status: string; // pending, accepted, rejected
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  // joined
  deviceName?: string;
  inviterName?: string | null;
};

export default function SharingPage() {
  const isReady = isSupabaseConfigured();
  const supabase = createClientSafe();
  const { vehicles } = useUserVehicles();

  const [sharedOut, setSharedOut] = useState<SharedDevice[]>([]); // mes partages envoyés
  const [sharedIn, setSharedIn] = useState<SharedDevice[]>([]); // partages reçus (je suis receiver)
  const [invitations, setInvitations] = useState<ShareInvitation[]>([]); // invitations pending reçues
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<SharedDevice | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!supabase || !isReady) return;

    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Non authentifié");
        return;
      }

      // 1. Partages envoyés (je suis owner)
      const { data: outData, error: outErr } = await supabase
        .from("shared_devices")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (outErr) throw outErr;

      // 2. Partages reçus (je suis shared_with_id)
      const { data: inData, error: inErr } = await supabase
        .from("shared_devices")
        .select("*")
        .eq("shared_with_id", user.id)
        .order("created_at", { ascending: false });

      if (inErr) throw inErr;

      // 3. Invitations reçues
      const { data: invData, error: invErr } = await supabase
        .from("share_invitations")
        .select("*")
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (invErr) throw invErr;

      // 4. Récupérer les user_devices pour avoir les noms
      const allDeviceIds = Array.from(new Set([
        ...(outData ?? []).map((s: any) => s.device_id),
        ...(inData ?? []).map((s: any) => s.device_id),
        ...(invData ?? []).map((i: any) => i.shared_device_id),
      ])).filter(Boolean);

      let devicesMap = new Map<string, { name: string; ownerId: string }>();
      if (allDeviceIds.length > 0) {
        const { data: devices } = await supabase
          .from("user_devices")
          .select("id, name, user_id")
          .in("id", allDeviceIds);
        devices?.forEach((d: any) => {
          devicesMap.set(d.id, { name: d.name || "Capteur", ownerId: d.user_id });
        });
      }

      // Mapper sharedOut
      const outArr: SharedDevice[] = (outData ?? []).map((s: any) => ({
        id: s.id,
        deviceId: s.device_id,
        ownerId: s.owner_id,
        sharedWithId: s.shared_with_id,
        permission: s.permission ?? "view_only",
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isExpired: s.is_expired,
        shareToken: s.share_token,
        deviceName: devicesMap.get(s.device_id)?.name ?? "Capteur inconnu",
      }));
      setSharedOut(outArr);

      // Mapper sharedIn
      const inArr: SharedDevice[] = (inData ?? []).map((s: any) => ({
        id: s.id,
        deviceId: s.device_id,
        ownerId: s.owner_id,
        sharedWithId: s.shared_with_id,
        permission: s.permission ?? "view_only",
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isExpired: s.is_expired,
        shareToken: s.share_token,
        deviceName: devicesMap.get(s.device_id)?.name ?? "Capteur inconnu",
      }));
      setSharedIn(inArr);

      // Mapper invitations
      const invArr: ShareInvitation[] = (invData ?? []).map((i: any) => ({
        id: i.id,
        sharedDeviceId: i.shared_device_id,
        inviterId: i.inviter_id,
        inviteeId: i.invitee_id,
        status: i.status,
        message: i.message,
        createdAt: i.created_at,
        respondedAt: i.responded_at,
        deviceName: devicesMap.get(i.shared_device_id)?.name ?? "Capteur inconnu",
      }));
      setInvitations(invArr);
    } catch (err: any) {
      console.error("[sharing] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }, [supabase, isReady]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const createShare = async (input: {
    deviceId: string;
    receiverPhone: string;
    permission: string;
    durationDays: number;
  }) => {
    if (!supabase) return { success: false, error: "Non configuré" };

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { success: false, error: "Non authentifié" };

      // 1. Vérifier que le device appartient bien à l'utilisateur
      const { data: device } = await supabase
        .from("user_devices")
        .select("id, name, user_id")
        .eq("id", input.deviceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!device) {
        return { success: false, error: "Ce capteur ne vous appartient pas." };
      }

      // 2. Récupérer l'ID du user cible via son phone
      const { data: targetUser } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("phone", input.receiverPhone)
        .maybeSingle();

      if (!targetUser) {
        return {
          success: false,
          error: "Aucun utilisateur YAZZ trouvé avec ce numéro. Demandez à la personne de créer un compte d'abord.",
        };
      }

      // 3. Vérifier qu'un partage n'existe pas déjà
      const { data: existing } = await supabase
        .from("shared_devices")
        .select("id, is_expired")
        .eq("device_id", input.deviceId)
        .eq("shared_with_id", targetUser.id)
        .eq("is_expired", false)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "Ce véhicule est déjà partagé avec cette personne." };
      }

      // 4. Créer le shared_device
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.durationDays);

      const { error: insertErr } = await supabase.from("shared_devices").insert({
        device_id: input.deviceId,
        owner_id: user.id,
        shared_with_id: targetUser.id,
        permission: input.permission,
        expires_at: expiresAt.toISOString(),
        is_expired: false,
        share_token: crypto.randomUUID(),
      });

      if (insertErr) throw insertErr;

      await fetchShares();
      return { success: true };
    } catch (err: any) {
      console.error("[sharing] create erreur:", err);
      return { success: false, error: err.message ?? "Erreur lors du partage" };
    }
  };

  const revokeShare = async (share: SharedDevice) => {
    if (!supabase) return;
    setActionLoading(share.id);
    try {
      const { error: delErr } = await supabase
        .from("shared_devices")
        .delete()
        .eq("id", share.id);
      if (delErr) throw delErr;
      await fetchShares();
      setConfirmRevoke(null);
    } catch (err: any) {
      console.error("[sharing] revoke erreur:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const respondToInvitation = async (invitation: ShareInvitation, accept: boolean) => {
    if (!supabase) return;
    setActionLoading(invitation.id);
    try {
      const { error: updErr } = await supabase
        .from("share_invitations")
        .update({
          status: accept ? "accepted" : "rejected",
          responded_at: new Date().toISOString(),
        })
        .eq("id", invitation.id);
      if (updErr) throw updErr;
      await fetchShares();
    } catch (err: any) {
      console.error("[sharing] respond erreur:", err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Partages
            </h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              Partagez vos véhicules avec votre famille ou vos collaborateurs.
            </p>
          </div>
          {isReady && vehicles.length > 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="font-inter flex h-10 items-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium hover:shadow-yazz-elevated active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Partager
            </button>
          )}
        </div>

        {!isReady && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-muted">Configurez Supabase.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
            <p className="font-inter text-[12px] text-yazz-error">{error}</p>
          </div>
        )}

        {isReady && (
          <>
            {/* Invitations reçues */}
            {invitations.length > 0 && (
              <section className="mb-6">
                <h2 className="font-outfit mb-3 flex items-center gap-2 text-[15px] font-bold text-yazz-text-dark">
                  <Inbox className="h-4 w-4 text-yazz-primary" />
                  Invitations en attente
                  <span className="font-inter rounded-full bg-yazz-error/15 px-2 py-0.5 text-[10px] font-bold text-yazz-error">
                    {invitations.length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="rounded-yazz-xl border border-yazz-primary/30 bg-yazz-primary/5 p-4 yazz-shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg yazz-gradient-primary text-white">
                            <UserPlus className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-outfit text-[14px] font-semibold text-yazz-text-dark">
                              {inv.deviceName}
                            </p>
                            <p className="font-inter mt-0.5 text-[11px] text-yazz-text-muted">
                              Invitation reçue le {new Date(inv.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                            {inv.message && (
                              <p className="font-inter mt-1 text-[11px] italic text-yazz-text-body">
                                « {inv.message} »
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => respondToInvitation(inv, true)}
                            disabled={actionLoading === inv.id}
                            className="font-inter flex h-9 items-center gap-1.5 rounded-yazz-sm bg-yazz-success px-3 text-[11px] font-semibold text-white hover:bg-yazz-success/90 disabled:opacity-50"
                          >
                            {actionLoading === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Accepter
                          </button>
                          <button
                            onClick={() => respondToInvitation(inv, false)}
                            disabled={actionLoading === inv.id}
                            className="font-inter flex h-9 items-center gap-1.5 rounded-yazz-sm bg-yazz-error/10 px-3 text-[11px] font-semibold text-yazz-error hover:bg-yazz-error/20 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            Refuser
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Partages envoyés */}
            <section className="mb-6">
              <h2 className="font-outfit mb-3 flex items-center gap-2 text-[15px] font-bold text-yazz-text-dark">
                <Share2 className="h-4 w-4 text-yazz-primary" />
                Partages envoyés
                <span className="font-inter text-[12px] font-normal text-yazz-text-muted">
                  ({sharedOut.length})
                </span>
              </h2>

              {sharedOut.length === 0 ? (
                <div className="grid place-items-center py-8 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-yazz-accent">
                    <Share2 className="h-5 w-5 text-yazz-text-muted" />
                  </div>
                  <p className="font-outfit mt-2 text-[14px] font-semibold text-yazz-text-dark">
                    Aucun partage actif
                  </p>
                  <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                    Partagez un véhicule avec un proche.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {sharedOut.map((share) => (
                    <li key={share.id} className="rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-4 yazz-shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg yazz-gradient-primary text-white">
                            <Car className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-outfit truncate text-[14px] font-semibold text-yazz-text-dark">
                              {share.deviceName}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className={cn(
                                "font-inter inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                                share.permission === "view_and_alerts"
                                  ? "bg-yazz-info/10 text-yazz-info"
                                  : "bg-yazz-text-muted/10 text-yazz-text-muted"
                              )}>
                                {share.permission === "view_and_alerts" ? <Bell className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                {share.permission === "view_and_alerts" ? "Vue + Alertes" : "Vue seule"}
                              </span>
                              {share.expiresAt && (
                                <span className="font-inter text-yazz-text-caption">
                                  <Clock className="mr-0.5 inline h-3 w-3" />
                                  expire le {new Date(share.expiresAt).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                              {share.isExpired && (
                                <span className="font-inter rounded-full bg-yazz-error/10 px-2 py-0.5 text-[10px] font-bold text-yazz-error">
                                  Expiré
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setConfirmRevoke(share)}
                          disabled={actionLoading === share.id}
                          className="font-inter grid h-8 w-8 shrink-0 place-items-center rounded-yazz-sm text-yazz-error/70 hover:bg-yazz-error/10 hover:text-yazz-error"
                          title="Révoquer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Partages reçus */}
            {sharedIn.length > 0 && (
              <section>
                <h2 className="font-outfit mb-3 flex items-center gap-2 text-[15px] font-bold text-yazz-text-dark">
                  <ShieldCheck className="h-4 w-4 text-yazz-success" />
                  Véhicules partagés avec moi
                  <span className="font-inter text-[12px] font-normal text-yazz-text-muted">
                    ({sharedIn.length})
                  </span>
                </h2>
                <ul className="space-y-2">
                  {sharedIn.map((share) => (
                    <li key={share.id} className="rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-4 yazz-shadow-soft">
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg bg-yazz-success/10 text-yazz-success">
                          <Car className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-outfit truncate text-[14px] font-semibold text-yazz-text-dark">
                            {share.deviceName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={cn(
                              "font-inter inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                              share.permission === "view_and_alerts"
                                ? "bg-yazz-info/10 text-yazz-info"
                                : "bg-yazz-text-muted/10 text-yazz-text-muted"
                            )}>
                              {share.permission === "view_and_alerts" ? <Bell className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              {share.permission === "view_and_alerts" ? "Vue + Alertes" : "Vue seule"}
                            </span>
                            {share.expiresAt && (
                              <span className="font-inter text-yazz-text-caption">
                                <Clock className="mr-0.5 inline h-3 w-3" />
                                expire le {new Date(share.expiresAt).toLocaleDateString("fr-FR")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Modal partage */}
      {showAddModal && (
        <AddShareModal
          vehicles={vehicles.map((v) => ({ id: v.deviceId, name: v.name }))}
          onClose={() => setShowAddModal(false)}
          onCreate={async (input) => {
            const r = await createShare(input);
            if (r.success) setShowAddModal(false);
            return r;
          }}
        />
      )}

      {/* Modal revoke */}
      {confirmRevoke && (
        <ConfirmRevokeModal
          share={confirmRevoke}
          loading={actionLoading === confirmRevoke.id}
          onClose={() => setConfirmRevoke(null)}
          onConfirm={() => revokeShare(confirmRevoke)}
        />
      )}
    </div>
  );
}

import { Car } from "lucide-react";

function AddShareModal({
  vehicles,
  onClose,
  onCreate,
}: {
  vehicles: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (input: any) => Promise<{ success: boolean; error?: string }>;
}) {
  const [deviceId, setDeviceId] = useState(vehicles[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [permission, setPermission] = useState<"view_only" | "view_and_alerts">("view_only");
  const [durationDays, setDurationDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPhone = (raw: string) => {
    let p = raw.replace(/\s+/g, "");
    if (p.startsWith("0")) p = "+243" + p.slice(1);
    if (!p.startsWith("+")) p = "+" + p;
    return p;
  };

  const handleSubmit = async () => {
    setError(null);
    if (!deviceId) {
      setError("Sélectionnez un véhicule à partager.");
      return;
    }
    if (!phone) {
      setError("Le numéro de téléphone est requis.");
      return;
    }
    if (!/^\+243\d{9}$/.test(formatPhone(phone))) {
      setError("Numéro invalide. Format: +243XXXXXXXXX");
      return;
    }
    setLoading(true);
    const r = await onCreate({
      deviceId,
      receiverPhone: formatPhone(phone),
      permission,
      durationDays: parseInt(durationDays, 10),
    });
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-outfit mb-4 text-[16px] font-bold text-yazz-text-dark">Partager un véhicule</h2>

        <div className="space-y-3">
          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Véhicule *</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Numéro du destinataire *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+243 8XX XXX XXX"
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
            <p className="font-inter mt-1 text-[10px] text-yazz-text-caption">
              La personne doit avoir un compte YAZZ avec ce numéro.
            </p>
          </div>

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Permissions</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPermission("view_only")}
                className={cn(
                  "font-inter flex flex-col items-center gap-1 rounded-yazz-sm border py-2.5 text-[11px] font-semibold transition-all",
                  permission === "view_only" ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
                )}
              >
                <Eye className="h-4 w-4" />
                Vue seule
              </button>
              <button
                onClick={() => setPermission("view_and_alerts")}
                className={cn(
                  "font-inter flex flex-col items-center gap-1 rounded-yazz-sm border py-2.5 text-[11px] font-semibold transition-all",
                  permission === "view_and_alerts" ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
                )}
              >
                <Bell className="h-4 w-4" />
                Vue + Alertes
              </button>
            </div>
          </div>

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Durée (jours)</label>
            <div className="grid grid-cols-4 gap-2">
              {["7", "30", "90", "365"].map((d) => (
                <button
                  key={d}
                  onClick={() => setDurationDays(d)}
                  className={cn(
                    "font-outfit rounded-yazz-sm border py-2 text-[12px] font-bold transition-all",
                    durationDays === d ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
                  )}
                >
                  {d === "365" ? "1 an" : `${d}j`}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
              <p className="font-inter text-[11px] text-yazz-error">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm yazz-gradient-primary py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium hover:shadow-yazz-elevated disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Partager
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmRevokeModal({
  share,
  loading,
  onClose,
  onConfirm,
}: {
  share: SharedDevice;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg bg-yazz-error/10">
            <AlertTriangle className="h-5 w-5 text-yazz-error" />
          </div>
          <div>
            <h2 className="font-outfit text-[16px] font-bold text-yazz-text-dark">Révoquer le partage ?</h2>
            <p className="font-inter text-[11px] text-yazz-text-muted">Action irréversible</p>
          </div>
        </div>
        <p className="font-inter mb-4 text-[12px] text-yazz-text-muted">
          Le véhicule <strong>{share.deviceName}</strong> ne sera plus accessible à cette personne.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium hover:bg-yazz-error/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Révoquer
          </button>
        </div>
      </div>
    </div>
  );
}
