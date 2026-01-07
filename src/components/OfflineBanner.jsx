import React from "react";
import { useOffline } from "@/contexts/OfflineContext";

const OfflineBanner = () => {
  const { online, syncing, pendingCount, syncNow } = useOffline();

  if (online && pendingCount === 0 && !syncing) return null;

  return (
    /* CAMBIO CLAVE: 
       - 'bottom-3' para mobile (se posiciona abajo)
       - 'md:top-3' para tablets/desktop (se posiciona arriba)
       - 'md:bottom-auto' para resetear la posición inferior en escritorio
    */
    <div className="fixed bottom-3 md:top-3 md:bottom-auto left-1/2 -translate-x-1/2 z-[99999] w-[92%] max-w-xl">
      <div
        className={`rounded-2xl border shadow-lg px-4 py-3 backdrop-blur-md ${
          online ? "bg-white/90 border-slate-200" : "bg-slate-900/90 border-white/10"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="text-xl">{online ? "✅" : "📡"}</div>

          <div className="flex-1">
            <p className={`text-sm font-bold ${online ? "text-slate-900" : "text-white"}`}>
              {online ? "Conectado" : "Sin conexión"}
            </p>
            <p className={`text-xs ${online ? "text-slate-600" : "text-white/70"}`}>
              {online
                ? syncing
                  ? "Sincronizando operaciones pendientes…"
                  : pendingCount > 0
                    ? `Hay ${pendingCount} operación(es) pendiente(s) para sincronizar.`
                    : "Todo al día."
                : "Podés seguir usando la app. Se guardará y sincronizará al volver internet."}
            </p>
          </div>

          <button
            className={`text-xs font-black px-3 py-2 rounded-xl border ${
              online
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-900 border-white"
            } disabled:opacity-50`}
            onClick={syncNow}
            disabled={!online || syncing || pendingCount === 0}
            title={!online ? "Conectate para sincronizar" : "Sincronizar ahora"}
          >
            {syncing ? "SYNC…" : "SYNC"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineBanner;