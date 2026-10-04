"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Composant réutilisable d'upload de photo.
//
// Fonctionnement :
// 1. L'utilisateur sélectionne un fichier image
// 2. L'image est compressée via canvas (max 400x400, JPEG 0.85)
// 3. Le résultat est une data URL base64 (fonctionne sans Storage bucket)
// 4. La data URL est passée au parent via onChange
//
// Ce composant ne dépend pas de Supabase Storage — il stocke l'image
// compressée comme data URL (base64). Le parent décide dans quelle colonne
// l'enregistrer : url_image (photo du capteur) ou vehicle_photo (photo du
// véhicule, utilisée pour la reconnaissance SOS par les autres utilisateurs).
// Taille typique : 30-50 ko pour 400x400 JPEG, parfaitement adaptée.
// ============================================================

type YazzPhotoUploadProps = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  maxSize?: number; // px, default 400
  quality?: number; // 0-1, default 0.85
};

export function YazzPhotoUpload({
  value,
  onChange,
  label = "Photo du capteur",
  maxSize = 400,
  quality = 0.85,
}: YazzPhotoUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      setLoading(true);
      setError(null);

      try {
        const dataUrl = await compressImage(file, maxSize, quality);
        onChange(dataUrl);
      } catch (err: any) {
        setError(err.message || "Erreur lors du traitement de l'image.");
      } finally {
        setLoading(false);
      }
    },
    [maxSize, quality, onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset pour permettre de re-sélectionner le même fichier
    e.target.value = "";
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
  };

  return (
    <div>
      <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
        {label}
      </label>
      <div className="flex items-center gap-3">
        {/* Preview / Upload zone */}
        <div className="relative">
          {value ? (
            <div className="group relative h-16 w-16 overflow-hidden rounded-[14px] border border-yazz-border-light">
              <img src={value} alt="Aperçu" className="h-full w-full object-cover" />
              {/* Bouton supprimer */}
              <button
                type="button"
                onClick={handleRemove}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-yazz-error/90 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Supprimer la photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className={cn(
                "grid h-16 w-16 place-items-center rounded-[14px] border-2 border-dashed border-yazz-border-medium text-yazz-text-caption transition-colors hover:border-yazz-primary hover:text-yazz-primary",
                loading && "opacity-50"
              )}
              aria-label="Ajouter une photo"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-yazz-primary" />
              ) : (
                <Camera className="h-5 w-5" />
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

        {/* Texte aide + bouton changer */}
        <div className="flex-1 min-w-0">
          {value ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="font-inter text-[11px] font-semibold text-yazz-primary hover:text-yazz-primary/80"
            >
              Changer la photo
            </button>
          ) : (
            <p className="font-inter text-[10px] text-yazz-text-caption">
              Cliquez pour ajouter une photo du capteur (optionnel)
            </p>
          )}
          {error && (
            <p className="font-inter mt-1 text-[10px] text-yazz-error">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Compression d'image via canvas.
// Redimensionne pour que la plus grande dimension soit <= maxSize,
// puis encode en JPEG à la qualité spécifiée.
// ============================================================
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Redimensionner en gardant le ratio
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
