"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehiclePhotos } from "@/hooks/use-vehicle-photos";

// ============================================================
// Galerie de photos multiples du véhicule (max 5).
//
// Utilise le hook useVehiclePhotos qui gère :
// - Le fetch initial
// - Les subscriptions Realtime (payload appliqué directement au state)
// - Le CRUD (addPhoto, removePhoto)
//
// Deux modes de fonctionnement :
// 1. deviceId fourni → CRUD direct dans la DB (mode "Edit")
// 2. deviceId = null → mode "pending" pour la création (Add)
//    Les photos sont stockées dans un array local (urls uniquement)
//    Le parent doit appeler insertPendingPhotos(deviceId) après création
// ============================================================

type YazzPhotoGalleryProps = {
  deviceId: string | null;
  label?: string;
  maxPhotos?: number;
  // Mode "pending" (Add) : callback appelé quand les urls locales changent
  pendingUrls?: string[];
  onPendingUrlsChange?: (urls: string[]) => void;
};

const MAX_DEFAULT = 5;

export function YazzPhotoGallery({
  deviceId,
  label = "Photos du véhicule (pour SOS)",
  maxPhotos = MAX_DEFAULT,
  pendingUrls,
  onPendingUrlsChange,
}: YazzPhotoGalleryProps) {
  // Hook Realtime (seulement si deviceId est fourni — mode Edit)
  const { photos, loading, addPhoto, removePhoto } = useVehiclePhotos(deviceId);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le nombre de photos affichées dépend du mode
  const currentCount = deviceId ? photos.length : (pendingUrls?.length ?? 0);
  const canAddMore = currentCount < maxPhotos;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Veuillez sélectionner une image.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Image trop lourde (max 10 Mo).");
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const dataUrl = await compressImage(file, 400, 0.85);

        if (deviceId) {
          // Mode Edit : insert direct dans la DB
          const result = await addPhoto(dataUrl);
          if (!result.success) {
            setError(result.error || "Erreur lors de l'ajout");
          }
        } else {
          // Mode Add (pending) : stocker dans le state local
          if (onPendingUrlsChange && pendingUrls !== undefined) {
            if (pendingUrls.length >= maxPhotos) {
              setError(`Maximum ${maxPhotos} photos atteint`);
              return;
            }
            onPendingUrlsChange([...pendingUrls, dataUrl]);
          }
        }
      } catch (err: any) {
        setError(err.message || "Erreur lors du traitement de l'image.");
      } finally {
        setUploading(false);
      }
    },
    [deviceId, addPhoto, pendingUrls, onPendingUrlsChange, maxPhotos]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleRemove = async (id: string | number) => {
    setError(null);
    if (deviceId) {
      // Mode Edit : delete dans la DB
      const result = await removePhoto(id as string);
      if (!result.success) {
        setError(result.error || "Erreur lors de la suppression");
      }
    } else {
      // Mode Add (pending) : retirer du state local
      if (onPendingUrlsChange && pendingUrls !== undefined) {
        const newUrls = pendingUrls.filter((_, i) => i !== id);
        onPendingUrlsChange(newUrls);
      }
    }
  };

  // Liste des URLs à afficher (depuis la DB ou depuis le state pending)
  const displayUrls: { id: string | number; url: string }[] = deviceId
    ? photos.map((p) => ({ id: p.id, url: p.url }))
    : (pendingUrls || []).map((url, i) => ({ id: i, url }));

  return (
    <div>
      <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
        {label}
        <span className="ml-1.5 text-[10px] font-normal text-yazz-text-caption">
          ({currentCount}/{maxPhotos})
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {/* Photos existantes */}
        {displayUrls.map((photo) => (
          <div
            key={photo.id}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-yazz-border-light"
          >
            <img
              src={photo.url}
              alt="Photo véhicule"
              className="h-full w-full object-cover"
            />
            {/* Bouton supprimer */}
            <button
              type="button"
              onClick={() => handleRemove(photo.id)}
              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-yazz-error/90 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Supprimer la photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Bouton ajouter (si pas encore au max) */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || loading}
            className={cn(
              "grid h-16 w-16 shrink-0 place-items-center rounded-[14px] border-2 border-dashed border-yazz-border-medium text-yazz-text-caption transition-colors hover:border-yazz-primary hover:text-yazz-primary",
              (uploading || loading) && "opacity-50"
            )}
            aria-label="Ajouter une photo"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-yazz-primary" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Hidden input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {/* Aide / erreur */}
      {error ? (
        <p className="font-inter mt-1.5 text-[10px] text-yazz-error">{error}</p>
      ) : currentCount === 0 ? (
        <p className="font-inter mt-1.5 text-[10px] text-yazz-text-caption">
          Ajoutez jusqu'à {maxPhotos} photos du véhicule (différents angles)
          pour aider les vigiles à l'identifier en cas de SOS.
        </p>
      ) : null}
    </div>
  );
}

// ============================================================
// Compression d'image via canvas (réutilisée depuis yazz-photo-upload)
// ============================================================
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas non supporté"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Image invalide"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.readAsDataURL(file);
  });
}
