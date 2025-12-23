import React, { useEffect, useState } from "react";

const OfflineBlocker = () => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
      style={{ pointerEvents: "all" }} // bloquea clicks debajo
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-md w-[92%] rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
          <span className="text-2xl">📡</span>
        </div>

        <h2 className="text-lg font-bold text-slate-900">Sin conexión a internet</h2>
        <p className="mt-2 text-sm text-slate-600">
          No podés usar la app hasta que vuelvas a estar conectado.
        </p>

        <div className="mt-4 text-xs text-slate-500">
          Tip: activá datos o Wi-Fi y volvé a intentar.
        </div>
      </div>
    </div>
  );
};

export default OfflineBlocker;
