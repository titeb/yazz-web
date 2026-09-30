// ============================================================
// YAZZ — Types Supabase Database
// Calqués sur les migrations SQL de yazz_backend (001 → 036).
// Utilisés pour le typage statique du client Supabase.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VehicleStatus = "moving" | "idle" | "offline" | "alert";

export type AlertType =
  | "geofence"
  | "speed"
  | "battery"
  | "parking"
  | "sos"
  | "jamming"
  | "gps_frozen";

export type AlertSeverity = "info" | "warning" | "critical";

export type PaymentStatus =
  | "PENDING"
  | "SUBMITTED"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type PaymentProvider = "shwary" | "pawapay";

export type Database = {
  public: {
    Tables: {
      // ─── Utilisateurs ─────────────────────────────────────────────
      users: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          subscription_status: string | null;
          plan_id: string | null;
          subscription_end: string | null;
          credit_notifications_enabled: boolean | null;
          fcm_token: string | null;
          preferred_language: string | null;
          is_vigile: boolean | null;
          sos_vigil_enabled: boolean | null;
          jamming_alerts_enabled: boolean | null;
          gps_frozen_alerts_enabled: boolean | null;
          gps_frozen_threshold_min: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          subscription_status?: string | null;
          plan_id?: string | null;
          subscription_end?: string | null;
          credit_notifications_enabled?: boolean | null;
          fcm_token?: string | null;
          preferred_language?: string | null;
          is_vigile?: boolean | null;
          sos_vigil_enabled?: boolean | null;
          jamming_alerts_enabled?: boolean | null;
          gps_frozen_alerts_enabled?: boolean | null;
          gps_frozen_threshold_min?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };

      // ─── Devices (capteurs GPS) ──────────────────────────────────
      devices: {
        Row: {
          id: string; // IMEI
          name: string | null;
          model: string | null;
          protocol: "st901" | "concox" | "istartek" | null;
          sim_phone: string | null;
          engine_cut_state: boolean | null;
          last_engine_cut_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          model?: string | null;
          protocol?: "st901" | "concox" | "istartek" | null;
          sim_phone?: string | null;
          engine_cut_state?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["devices"]["Insert"]>;
      };

      // ─── Liaison user ↔ devices ──────────────────────────────────
      user_devices: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          nickname: string | null;
          vehicle_plate: string | null;
          vehicle_type: string | null;
          vehicle_photo: string | null;
          is_primary: boolean | null;
          is_active: boolean | null;
          is_shared: boolean | null;
          shared_with: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          nickname?: string | null;
          vehicle_plate?: string | null;
          vehicle_type?: string | null;
          vehicle_photo?: string | null;
          is_primary?: boolean | null;
          is_active?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_devices"]["Insert"]>;
      };

      // ─── Dernière position connue (1 ligne par device) ───────────
      last_known_positions: {
        Row: {
          device_id: string;
          latitude: number;
          longitude: number;
          speed: number | null;
          heading: number | null;
          is_valid: boolean | null;
          is_connected: boolean | null;
          battery_percent: number | null;
          acc_status: boolean | null;
          last_update: string;
          timestamp: string | null;
        };
        Insert: {
          device_id: string;
          latitude: number;
          longitude: number;
          speed?: number | null;
          heading?: number | null;
          is_valid?: boolean | null;
          is_connected?: boolean | null;
          battery_percent?: number | null;
          acc_status?: boolean | null;
          last_update?: string;
          timestamp?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["last_known_positions"]["Insert"]>;
      };

      // ─── Points GPS bruts ────────────────────────────────────────
      gps_points: {
        Row: {
          id: string;
          device_id: string;
          latitude: number;
          longitude: number;
          speed: number | null;
          heading: number | null;
          is_valid: boolean | null;
          battery_percent: number | null;
          acc_status: boolean | null;
          timestamp: string;
          expire_at: string | null;
        };
        Insert: {
          id?: string;
          device_id: string;
          latitude: number;
          longitude: number;
          speed?: number | null;
          heading?: number | null;
          is_valid?: boolean | null;
          battery_percent?: number | null;
          acc_status?: boolean | null;
          timestamp?: string;
          expire_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["gps_points"]["Insert"]>;
      };

      // ─── Trajets consolidés ──────────────────────────────────────
      trips: {
        Row: {
          id: string;
          device_id: string;
          started_at: string;
          ended_at: string | null;
          distance_km: number | null;
          polyline: Json | null;
          summary: Json | null;
        };
        Insert: {
          id?: string;
          device_id: string;
          started_at: string;
          ended_at?: string | null;
          distance_km?: number | null;
          polyline?: Json | null;
          summary?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["trips"]["Insert"]>;
      };

      // ─── Géofences ───────────────────────────────────────────────
      geofences: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          name: string;
          type: "circle" | "polygon" | null;
          coordinates: Json | null;
          radius: number | null;
          color: string | null;
          is_active: boolean | null;
          alert_on_enter: boolean | null;
          alert_on_exit: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          name: string;
          type?: "circle" | "polygon" | null;
          coordinates?: Json | null;
          radius?: number | null;
          color?: string | null;
          is_active?: boolean | null;
          alert_on_enter?: boolean | null;
          alert_on_exit?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["geofences"]["Insert"]>;
      };

      // ─── Notifications ──────────────────────────────────────────
      notifications: {
        Row: {
          id: string;
          user_id: string;
          device_id: string | null;
          type: string;
          title: string;
          message: string;
          severity: "info" | "warning" | "critical" | null;
          is_read: boolean | null;
          data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id?: string | null;
          type: string;
          title: string;
          message: string;
          severity?: "info" | "warning" | "critical" | null;
          is_read?: boolean | null;
          data?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };

      // ─── Crédits ────────────────────────────────────────────────
      user_credits: {
        Row: {
          user_id: string;
          balance: number;
          currency: string | null;
          is_active: boolean | null;
          last_deduction: string | null;
          last_topup: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          balance: number;
          currency?: string | null;
          is_active?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_credits"]["Insert"]>;
      };

      // ─── Paiements ──────────────────────────────────────────────
      payments: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          provider: PaymentProvider;
          provider_transaction_id: string | null;
          status: PaymentStatus;
          phone: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          currency: string;
          provider: PaymentProvider;
          provider_transaction_id?: string | null;
          status?: PaymentStatus;
          phone?: string | null;
          failure_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };

      // ─── Sessions parking ───────────────────────────────────────
      parking_sessions: {
        Row: {
          id: string;
          device_id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          latitude: number;
          longitude: number;
          is_active: boolean | null;
          trigger_alert: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          user_id: string;
          started_at: string;
          ended_at?: string | null;
          latitude: number;
          longitude: number;
          is_active?: boolean | null;
          trigger_alert?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["parking_sessions"]["Insert"]>;
      };

      // ─── Config alertes par device ──────────────────────────────
      device_alert_configs: {
        Row: {
          id: string;
          device_id: string;
          user_id: string;
          alert_type: AlertType;
          is_enabled: boolean | null;
          threshold: Json | null;
          cooldown_sec: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          user_id: string;
          alert_type: AlertType;
          is_enabled?: boolean | null;
          threshold?: Json | null;
          cooldown_sec?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["device_alert_configs"]["Insert"]>;
      };

      // ─── Partage de devices ─────────────────────────────────────
      shared_devices: {
        Row: {
          id: string;
          device_id: string;
          owner_id: string;
          receiver_id: string;
          permissions: Json | null;
          is_active: boolean | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          owner_id: string;
          receiver_id: string;
          permissions?: Json | null;
          is_active?: boolean | null;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["shared_devices"]["Insert"]>;
      };

      // ─── Invitations de partage ────────────────────────────────
      share_invitations: {
        Row: {
          id: string;
          device_id: string;
          owner_id: string;
          receiver_phone: string;
          token: string;
          status: "pending" | "accepted" | "rejected" | "expired" | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          owner_id: string;
          receiver_phone: string;
          token: string;
          status?: "pending" | "accepted" | "rejected" | "expired" | null;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["share_invitations"]["Insert"]>;
      };

      // ─── Réglages app ──────────────────────────────────────────
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      adjust_user_credits_atomic: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
        };
        Returns: { success: boolean; new_balance: number } | null;
      };
      get_dashboard_stats: {
        Args: Record<string, never>;
        Returns: Json;
      };
      delete_user_cascade: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      delete_device_cascade: {
        Args: { p_device_id: string };
        Returns: Json;
      };
      process_gps_trips: {
        Args: Record<string, never>;
        Returns: void;
      };
    };

    Enums: {
      payment_status: PaymentStatus;
      payment_provider: PaymentProvider;
      alert_type: AlertType;
      alert_severity: AlertSeverity;
      vehicle_status: VehicleStatus;
    };
  };
};

export default Database;
