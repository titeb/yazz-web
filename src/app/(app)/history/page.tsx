"use client";

import { Construction, Route } from "lucide-react";

export default function HistoryPagePlaceholder() {
  return (
    <div className="grid h-full place-items-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-yazz-xl yazz-gradient-subtle">
          <Route className="h-7 w-7 text-yazz-primary" />
        </div>
        <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
          Historique trajets
        </h1>
        <p className="font-inter mt-2 text-[13px] text-yazz-text-muted">
          Cette fonctionnalité sera disponible dans une phase ultérieure (P1).
          Elle affichera la timeline des trajets par jour, la polyline sur carte, les stats (km, durée, vitesse), et le replay animé.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-yazz-sm bg-yazz-warning/10 px-3 py-2">
          <Construction className="h-4 w-4 text-yazz-warning" />
          <span className="font-inter text-[12px] font-semibold text-yazz-warning">Bientôt disponible</span>
        </div>
      </div>
    </div>
  );
}
